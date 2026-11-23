import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createDatabase, createPool, Database } from '../src/database/client';
import { runMigrations } from '../src/database/migrate';
import { InboundModule } from '../src/modules/inbound/inbound.module';
import { InboundProcessorService } from '../src/modules/inbound/inbound-processor.service';
import { MaintenanceService } from '../src/modules/inbound/maintenance.service';
import { InstagramGraphClient } from '../src/modules/instagram/instagram-graph.client';

export const ORIGIN = 'http://web.test';

let migrated = false;

export async function createTestApp() {
  if (!migrated) {
    await runMigrations(process.env.DATABASE_URL!);
    migrated = true;
  }
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, InboundModule],
  }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();
  const pool = createPool(process.env.DATABASE_URL!);
  const db = createDatabase(pool);
  const meta = new FakeMeta();
  app.get(InstagramGraphClient).useFetch(meta.fetch);
  return {
    app,
    db,
    meta,
    http: () => request(app.getHttpServer()),
    processor: app.get(InboundProcessorService),
    maintenance: app.get(MaintenanceService),
    async close() {
      await pool.end();
      await app.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export async function resetDatabase(db: Database) {
  await db.execute(sql`truncate table activity_logs, messages, conversations, contacts, automations, webhook_events, oauth_states, channel_accounts, workspace_members, workspaces, sessions, users restart identity cascade`);
  const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  await redis.flushdb();
  await redis.quit();
}

/** Cria usuário, faz login e devolve um agente HTTP com o cookie de sessão. */
export async function signup(t: TestApp, email = `u${Math.random().toString(36).slice(2)}@ex.com`, name = 'Pessoa Teste') {
  const agent = request.agent(t.app.getHttpServer());
  const res = await agent.post('/auth/signup').set('origin', ORIGIN).send({ name, email, password: 'senha1234' });
  if (res.status !== 201) throw new Error(`signup falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: string; email: string } };
}

export async function createWorkspace(agent: request.Agent, name = 'Empresa Teste') {
  const res = await agent.post('/workspaces').set('origin', ORIGIN).send({ name });
  if (res.status !== 201) throw new Error(`workspace falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.workspace as { id: string; slug: string };
}

export function sign(body: string, secret = 'test-app-secret') {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Simula os endpoints oficiais da Meta usados no fluxo de conexão. Só existe nos testes:
 * a aplicação real sempre fala com graph.instagram.com / api.instagram.com.
 */
export class FakeMeta {
  igUserId = '17841400000000001';
  username = 'loja_teste';
  calls: { method: string; url: string }[] = [];
  failMeWith: { status: number; body: unknown } | null = null;
  profiles: Record<string, { name?: string; username?: string; profile_pic?: string }> = {};

  fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    this.calls.push({ method, url: url.toString() });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.hostname === 'api.instagram.com' && url.pathname === '/oauth/access_token') {
      const form = new URLSearchParams(String(init?.body));
      if (form.get('code') !== 'good-code') return json(400, { error_type: 'OAuthException', code: 400, error_message: 'Invalid code' });
      return json(200, { data: [{ access_token: 'short-token', user_id: this.igUserId, permissions: 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments' }] });
    }
    if (url.pathname === '/access_token') return json(200, { access_token: 'long-token-1', token_type: 'bearer', expires_in: 5184000 });
    if (url.pathname === '/refresh_access_token') return json(200, { access_token: 'long-token-2', token_type: 'bearer', expires_in: 5184000 });
    if (url.pathname.endsWith('/me/subscribed_apps')) return json(200, { success: true });
    if (url.pathname.endsWith('/me')) {
      if (this.failMeWith) return json(this.failMeWith.status, this.failMeWith.body);
      return json(200, { id: 'app-scoped-1', user_id: this.igUserId, username: this.username, name: 'Loja Teste', account_type: 'BUSINESS' });
    }
    const igsid = url.pathname.split('/').pop()!;
    if (this.profiles[igsid]) return json(200, this.profiles[igsid]);
    return json(400, { error: { message: 'User consent is required', code: 230, type: 'OAuthException' } });
  }) as typeof fetch;
}
