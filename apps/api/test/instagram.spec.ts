import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { channelAccounts, contacts, conversations, messages, webhookEvents } from '../src/database/schema';
import { createTestApp, createWorkspace, ORIGIN, resetDatabase, sign, signup, TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDatabase(t.db);
  t.meta.calls = [];
  t.meta.failMeWith = null;
  t.meta.igUserId = '17841400000000001';
});

/** Executa o fluxo OAuth completo até o callback e devolve o state usado. */
async function connectInstagram(agent: Awaited<ReturnType<typeof signup>>['agent'], wsId: string, code = 'good-code') {
  const start = await agent.post(`/workspaces/${wsId}/channel-accounts/instagram/connect`).set('origin', ORIGIN);
  expect(start.status).toBe(201);
  const url = new URL(start.body.authorizeUrl);
  const state = url.searchParams.get('state')!;
  const cb = await agent.get(`/integrations/instagram/callback?code=${code}%23_&state=${state}`);
  return { start, url, state, cb };
}

async function postWebhook(body: unknown) {
  const raw = JSON.stringify(body);
  return t.http().post('/webhooks/instagram').set('content-type', 'application/json').set('x-hub-signature-256', sign(raw)).send(raw);
}

async function processAll() {
  const events = await t.db.select().from(webhookEvents).where(eq(webhookEvents.status, 'received'));
  for (const e of events) await t.processor.process(e.id, 1, 6);
}

describe('conexão OAuth com o Instagram', () => {
  it('gera URL oficial de autorização com escopos e state', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    const start = await agent.post(`/workspaces/${ws.id}/channel-accounts/instagram/connect`).set('origin', ORIGIN);
    const url = new URL(start.body.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-app-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://api.test/integrations/instagram/callback');
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments');
    expect(url.searchParams.get('state')!.length).toBeGreaterThan(20);
  });

  it('conclui a conexão, guarda o token criptografado e assina os webhooks', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    const { cb } = await connectInstagram(agent, ws.id);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toMatch(new RegExp(`^http://web.test/w/${ws.slug}/contas\\?connected=`));

    const [acc] = await t.db.select().from(channelAccounts);
    expect(acc).toMatchObject({ externalId: '17841400000000001', username: 'loja_teste', status: 'connected', webhookSubscribed: true });
    expect(acc.accessTokenEnc).not.toContain('long-token');
    expect(acc.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
    // O código chega com o sufixo "#_" e precisa ser limpo antes da troca.
    expect(t.meta.calls.some((c) => c.url.includes('/me/subscribed_apps') && c.method === 'POST')).toBe(true);

    const list = await agent.get(`/workspaces/${ws.id}/channel-accounts`);
    expect(list.body.accounts).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('accessToken');
    expect(list.body.limit).toMatchObject({ max: 1, used: 1 });
  });

  it('não aceita state reutilizado, expirado ou de outro usuário', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    const { state } = await connectInstagram(agent, ws.id);
    const again = await agent.get(`/integrations/instagram/callback?code=good-code&state=${state}`);
    expect(again.headers.location).toContain('error=invalid_state');

    const other = await signup(t);
    const ws2 = await createWorkspace(other.agent);
    t.meta.igUserId = '999';
    const start = await other.agent.post(`/workspaces/${ws2.id}/channel-accounts/instagram/connect`).set('origin', ORIGIN);
    const st = new URL(start.body.authorizeUrl).searchParams.get('state');
    const hijack = await agent.get(`/integrations/instagram/callback?code=good-code&state=${st}`);
    expect(hijack.headers.location).toContain('error=user_mismatch');
  });

  it('trata cancelamento e código inválido sem criar conta', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    const start = await agent.post(`/workspaces/${ws.id}/channel-accounts/instagram/connect`).set('origin', ORIGIN);
    const state = new URL(start.body.authorizeUrl).searchParams.get('state');
    const denied = await agent.get(`/integrations/instagram/callback?error=access_denied&state=${state}`);
    expect(denied.headers.location).toContain('error=access_denied');

    const { cb } = await connectInstagram(agent, ws.id, 'bad-code');
    expect(cb.headers.location).toContain('error=connect_failed');
    expect(await t.db.select().from(channelAccounts)).toHaveLength(0);
  });

  it('respeita o limite de contas do plano', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    const res = await agent.post(`/workspaces/${ws.id}/channel-accounts/instagram/connect`).set('origin', ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('plan_limit_reached');
  });

  it('impede a mesma conta do Instagram em duas empresas', async () => {
    const a = await signup(t);
    const wsA = await createWorkspace(a.agent);
    await connectInstagram(a.agent, wsA.id);
    const b = await signup(t);
    const wsB = await createWorkspace(b.agent);
    const { cb } = await connectInstagram(b.agent, wsB.id);
    expect(cb.headers.location).toContain('error=account_in_use');
  });

  it('verificação de status marca a conta como revogada quando a Meta recusa o token', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    const [acc] = await t.db.select().from(channelAccounts);
    t.meta.failMeWith = { status: 400, body: { error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } } };
    const res = await agent.post(`/workspaces/${ws.id}/channel-accounts/${acc.id}/check`).set('origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.account.status).toBe('revoked');
    expect(res.body.account.lastError).toMatch(/Reconecte/);
  });

  it('renovação de token respeita o mínimo de 24h e atualiza o token', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    const [acc] = await t.db.select().from(channelAccounts);
    const tooSoon = await agent.post(`/workspaces/${ws.id}/channel-accounts/${acc.id}/refresh-token`).set('origin', ORIGIN);
    expect(tooSoon.status).toBe(409);

    await t.db.update(channelAccounts).set({ tokenRefreshedAt: new Date(Date.now() - 50 * 86400_000), tokenExpiresAt: new Date(Date.now() + 5 * 86400_000) }).where(eq(channelAccounts.id, acc.id));
    const result = await t.maintenance.refreshTokens();
    expect(result).toMatchObject({ due: 1, refreshed: 1 });
    const [after] = await t.db.select().from(channelAccounts);
    expect(after.accessTokenEnc).not.toBe(acc.accessTokenEnc);
    expect(after.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
  });

  it('marca como expirada a conta com token vencido', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    await t.db.update(channelAccounts).set({ tokenExpiresAt: new Date(Date.now() - 1000) });
    await t.maintenance.refreshTokens();
    const [acc] = await t.db.select().from(channelAccounts);
    expect(acc.status).toBe('token_expired');
  });

  it('desconecta: cancela webhooks e apaga o token', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    const [acc] = await t.db.select().from(channelAccounts);
    const res = await agent.delete(`/workspaces/${ws.id}/channel-accounts/${acc.id}`).set('origin', ORIGIN);
    expect(res.status).toBe(204);
    const [after] = await t.db.select().from(channelAccounts);
    expect(after).toMatchObject({ status: 'disconnected', accessTokenEnc: null, webhookSubscribed: false });
    expect(t.meta.calls.some((c) => c.method === 'DELETE' && c.url.includes('/me/subscribed_apps'))).toBe(true);
    // Depois de desconectar, pode conectar de novo (limite liberado).
    const { cb } = await connectInstagram(agent, ws.id);
    expect(cb.headers.location).toContain('connected=');
  });
});

describe('webhooks do Instagram', () => {
  it('responde ao desafio de verificação somente com o token correto', async () => {
    const ok = await t.http().get('/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123');
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('abc123');
    const bad = await t.http().get('/webhooks/instagram?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123');
    expect(bad.status).toBe(403);
  });

  it('rejeita assinatura inválida sem gravar nada', async () => {
    const raw = JSON.stringify({ object: 'instagram', entry: [] });
    const res = await t.http().post('/webhooks/instagram').set('content-type', 'application/json').set('x-hub-signature-256', sign(raw, 'outro-segredo')).send(raw);
    expect(res.status).toBe(401);
    const none = await t.http().post('/webhooks/instagram').set('content-type', 'application/json').send(raw);
    expect(none.status).toBe(401);
    expect(await t.db.select().from(webhookEvents)).toHaveLength(0);
  });

  it('recebe mensagem real, cria contato, conversa e mensagem uma única vez', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    t.meta.profiles['igsid-1'] = { name: 'Maria Souza', username: 'maria.souza', profile_pic: 'https://cdn/x.jpg' };

    const body = {
      object: 'instagram',
      entry: [{ id: '17841400000000001', time: Date.now(), messaging: [{ sender: { id: 'igsid-1' }, recipient: { id: '17841400000000001' }, timestamp: Date.now(), message: { mid: 'mid-1', text: 'Qual o PREÇO?' } }] }],
    };
    const first = await postWebhook(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ received: 1, inserted: 1, duplicates: 0 });

    // Reenvio da Meta: deduplicado no recebimento.
    const second = await postWebhook(body);
    expect(second.body).toMatchObject({ received: 1, inserted: 0, duplicates: 1 });

    await processAll();
    const [event] = await t.db.select().from(webhookEvents);
    expect(event.status).toBe('processed');
    // Reprocessar o mesmo evento não duplica nada.
    expect(await t.processor.process(event.id, 1, 6)).toBe('skipped');

    const cs = await t.db.select().from(contacts);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ externalId: 'igsid-1', name: 'Maria Souza', firstName: 'Maria', username: 'maria.souza', source: 'dm' });
    const convs = await t.db.select().from(conversations);
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ status: 'new', unreadCount: 1 });
    const msgs = await t.db.select().from(messages);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ direction: 'inbound', sender: 'contact', type: 'text', text: 'Qual o PREÇO?', externalId: 'mid-1' });

    const dash = await agent.get(`/workspaces/${ws.id}/dashboard?period=today`);
    expect(dash.body.metrics).toMatchObject({ totalContacts: 1, newContacts: 1, conversationsReceived: 1, messagesReceived: 1, messagesSent: 0, responseRate: 0 });
    const feed = await agent.get(`/workspaces/${ws.id}/activity`);
    expect(feed.body.items.map((i: { type: string }) => i.type)).toEqual(expect.arrayContaining(['contact.created', 'conversation.started', 'channel.connected']));
  });

  it('registra a resposta enviada pelo app (eco) e calcula a taxa de resposta', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    const now = Date.now();
    await postWebhook({
      object: 'instagram',
      entry: [
        {
          id: '17841400000000001',
          time: now,
          messaging: [
            { sender: { id: 'igsid-2' }, recipient: { id: '17841400000000001' }, timestamp: now, message: { mid: 'in-1', text: 'oi' } },
            { sender: { id: '17841400000000001' }, recipient: { id: 'igsid-2' }, timestamp: now + 1000, message: { mid: 'out-1', text: 'Olá!', is_echo: true } },
          ],
        },
      ],
    });
    await processAll();
    const msgs = await t.db.select().from(messages);
    expect(msgs.map((m) => [m.direction, m.sender])).toEqual(expect.arrayContaining([['inbound', 'contact'], ['outbound', 'business_app']]));
    const dash = await agent.get(`/workspaces/${ws.id}/dashboard?period=today`);
    expect(dash.body.metrics).toMatchObject({ messagesSent: 1, responseRate: 1, conversationsAutoAnswered: 0 });
  });

  it('registra contato vindo de comentário', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    await postWebhook({ object: 'instagram', entry: [{ id: '17841400000000001', time: Date.now(), changes: [{ field: 'comments', value: { id: 'cm-1', text: 'QUERO', from: { id: 'igsid-9', username: 'joao' }, media: { id: 'md1' } } }] }] });
    await processAll();
    const [c] = await t.db.select().from(contacts);
    expect(c).toMatchObject({ externalId: 'igsid-9', username: 'joao', source: 'comment' });
  });

  it('guarda mas não processa eventos de contas não conectadas', async () => {
    const res = await postWebhook({ object: 'instagram', entry: [{ id: 'desconhecida', time: Date.now(), messaging: [{ sender: { id: 'x' }, recipient: { id: 'desconhecida' }, timestamp: Date.now(), message: { mid: 'z', text: 'oi' } }] }] });
    expect(res.body).toMatchObject({ inserted: 1, unrouted: 1 });
    const [e] = await t.db.select().from(webhookEvents);
    expect(e).toMatchObject({ status: 'ignored', workspaceId: null });
  });

  it('não mistura dados entre empresas', async () => {
    const a = await signup(t);
    const wsA = await createWorkspace(a.agent);
    await connectInstagram(a.agent, wsA.id);
    const b = await signup(t);
    const wsB = await createWorkspace(b.agent);
    t.meta.igUserId = '222';
    await connectInstagram(b.agent, wsB.id);

    await postWebhook({ object: 'instagram', entry: [{ id: '17841400000000001', time: Date.now(), messaging: [{ sender: { id: 'cliente' }, recipient: { id: '17841400000000001' }, timestamp: Date.now(), message: { mid: 'a-1', text: 'para A' } }] }] });
    await processAll();
    const dashA = await a.agent.get(`/workspaces/${wsA.id}/dashboard?period=today`);
    const dashB = await b.agent.get(`/workspaces/${wsB.id}/dashboard?period=today`);
    expect(dashA.body.metrics.totalContacts).toBe(1);
    expect(dashB.body.metrics.totalContacts).toBe(0);
  });

  it('falha de processamento é registrada e só vira "failed" na última tentativa', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    await connectInstagram(agent, ws.id);
    await postWebhook({ object: 'instagram', entry: [{ id: '17841400000000001', time: Date.now(), messaging: [{ sender: { id: 'u' }, recipient: { id: '17841400000000001' }, timestamp: Date.now(), message: { mid: 'f-1', text: 'x' } }] }] });
    const [e] = await t.db.select().from(webhookEvents);
    // Simula uma falha interna (ex.: banco indisponível) durante o processamento.
    const proc = t.processor as unknown as { dispatch: (...a: unknown[]) => Promise<unknown> };
    const realDispatch = proc.dispatch;
    proc.dispatch = async () => {
      throw new Error('banco indisponível');
    };
    await expect(t.processor.process(e.id, 1, 2)).rejects.toThrow('banco indisponível');
    let [after] = await t.db.select().from(webhookEvents).where(eq(webhookEvents.id, e.id));
    expect(after).toMatchObject({ status: 'received', attempts: 1 });
    await expect(t.processor.process(e.id, 2, 2)).rejects.toThrow();
    [after] = await t.db.select().from(webhookEvents).where(eq(webhookEvents.id, e.id));
    expect(after.status).toBe('failed');
    proc.dispatch = realDispatch;
    // Depois de falhar, o reprocessamento manual funciona normalmente.
    expect(await t.processor.process(e.id, 1, 6)).toMatchObject({ status: 'processed' });
    const feed = await agent.get(`/workspaces/${ws.id}/activity`);
    expect(feed.body.items.find((i: { type: string }) => i.type === 'webhook.failed')?.level).toBe('error');
  });
});
