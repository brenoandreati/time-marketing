import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { workspaceMembers } from '../src/database/schema';
import { createTestApp, createWorkspace, ORIGIN, resetDatabase, signup, TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDatabase(t.db));

describe('autenticação', () => {
  it('cadastra, consulta a sessão e sai', async () => {
    const { agent } = await signup(t, 'ana@ex.com', 'Ana');
    const me = await agent.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'ana@ex.com', name: 'Ana' });
    expect(me.body.user.passwordHash).toBeUndefined();

    expect((await agent.post('/auth/logout').set('origin', ORIGIN)).status).toBe(204);
    expect((await agent.get('/auth/me')).status).toBe(401);
  });

  it('não permite e-mail duplicado (sem diferenciar maiúsculas)', async () => {
    await signup(t, 'dup@ex.com');
    const res = await t.http().post('/auth/signup').set('origin', ORIGIN).send({ name: 'Outra', email: 'DUP@ex.com', password: 'senha1234' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('email_taken');
  });

  it('valida senha fraca e e-mail inválido', async () => {
    const res = await t.http().post('/auth/signup').set('origin', ORIGIN).send({ name: 'A', email: 'x', password: '123' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fieldErrors)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('login com senha errada falha sem revelar se o e-mail existe', async () => {
    await signup(t, 'bia@ex.com');
    const wrong = await t.http().post('/auth/login').set('origin', ORIGIN).send({ email: 'bia@ex.com', password: 'errada123' });
    const missing = await t.http().post('/auth/login').set('origin', ORIGIN).send({ email: 'ninguem@ex.com', password: 'errada123' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.message).toBe(missing.body.message);
    const ok = await t.http().post('/auth/login').set('origin', ORIGIN).send({ email: 'BIA@ex.com', password: 'senha1234' });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'][0]).toMatch(/cv_session=.*HttpOnly/);
  });

  it('limita tentativas de login por minuto', async () => {
    process.env.DISABLE_RATE_LIMIT = '0';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await t.http().post('/auth/login').set('origin', ORIGIN).send({ email: 'x@ex.com', password: 'errada123' });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
    } finally {
      process.env.DISABLE_RATE_LIMIT = '1';
    }
  });

  it('exige sessão nas rotas protegidas', async () => {
    expect((await t.http().get('/workspaces')).status).toBe(401);
  });

  it('bloqueia requisições de outra origem (CSRF)', async () => {
    const { agent } = await signup(t);
    const res = await agent.post('/workspaces').set('origin', 'http://evil.test').send({ name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('invalid_origin');
  });
});

describe('multiempresa e permissões', () => {
  it('cria empresa com slug único e quem cria vira administrador', async () => {
    const { agent } = await signup(t);
    const a = await createWorkspace(agent, 'Loja Ária');
    const b = await createWorkspace(agent, 'Loja Ária');
    expect(a.slug).toBe('loja-aria');
    expect(b.slug).toBe('loja-aria-2');
    const list = await agent.get('/workspaces');
    expect(list.body.workspaces).toHaveLength(2);
    expect(list.body.workspaces[0].role).toBe('admin');
  });

  it('isola dados: usuário de outra empresa recebe 404', async () => {
    const owner = await signup(t);
    const ws = await createWorkspace(owner.agent, 'Empresa A');
    const intruder = await signup(t);
    for (const path of [`/workspaces/${ws.id}`, `/workspaces/${ws.id}/dashboard`, `/workspaces/${ws.id}/channel-accounts`, `/workspaces/${ws.id}/activity`]) {
      const res = await intruder.agent.get(path);
      expect(res.status, path).toBe(404);
    }
    const list = await intruder.agent.get('/workspaces');
    expect(list.body.workspaces).toHaveLength(0);
  });

  it('aplica a função do membro: atendente não gerencia contas nem a empresa', async () => {
    const owner = await signup(t);
    const ws = await createWorkspace(owner.agent);
    const agentUser = await signup(t);
    await t.db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: agentUser.user.id, role: 'agent' });

    expect((await agentUser.agent.get(`/workspaces/${ws.id}/dashboard`)).status).toBe(200);
    expect((await agentUser.agent.get(`/workspaces/${ws.id}/channel-accounts`)).status).toBe(200);
    const connect = await agentUser.agent.post(`/workspaces/${ws.id}/channel-accounts/instagram/connect`).set('origin', ORIGIN);
    expect(connect.status).toBe(403);
    const rename = await agentUser.agent.patch(`/workspaces/${ws.id}`).set('origin', ORIGIN).send({ name: 'Hack' });
    expect(rename.status).toBe(403);
    expect((await agentUser.agent.get(`/workspaces/${ws.id}/members`)).status).toBe(403);

    await t.db.update(workspaceMembers).set({ role: 'manager' }).where(eq(workspaceMembers.userId, agentUser.user.id));
    expect((await agentUser.agent.post(`/workspaces/${ws.id}/channel-accounts/instagram/connect`).set('origin', ORIGIN)).status).toBe(201);
  });

  it('administrador renomeia a empresa e a ação fica no registro de atividades', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    const res = await agent.patch(`/workspaces/${ws.id}`).set('origin', ORIGIN).send({ name: 'Nome Novo', timezone: 'America/Manaus' });
    expect(res.status).toBe(200);
    expect(res.body.workspace).toMatchObject({ name: 'Nome Novo', timezone: 'America/Manaus' });
    const bad = await agent.patch(`/workspaces/${ws.id}`).set('origin', ORIGIN).send({ timezone: 'Marte/Base' });
    expect(bad.status).toBe(400);
    const feed = await agent.get(`/workspaces/${ws.id}/activity`);
    expect(feed.body.items.map((i: { type: string }) => i.type)).toContain('workspace.updated');
  });

  it('rejeita id de empresa malformado', async () => {
    const { agent } = await signup(t);
    expect((await agent.get('/workspaces/nao-e-uuid/dashboard')).status).toBe(404);
  });

  it('dashboard valida o período', async () => {
    const { agent } = await signup(t);
    const ws = await createWorkspace(agent);
    expect((await agent.get(`/workspaces/${ws.id}/dashboard?period=custom&from=2026-02-01&to=2026-01-01`)).status).toBe(400);
    const ok = await agent.get(`/workspaces/${ws.id}/dashboard?period=30d`);
    expect(ok.status).toBe(200);
    expect(ok.body.series).toHaveLength(30);
    expect(ok.body.metrics.responseRate).toBeNull();
  });
});

describe('health', () => {
  it('responde com banco e redis', async () => {
    const res = await request(t.app.getHttpServer()).get('/health');
    expect(res.body).toEqual({ ok: true, database: true, redis: true });
  });
});
