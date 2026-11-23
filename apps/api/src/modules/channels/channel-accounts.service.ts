import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, count, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { randomToken, SecretBox, sha256 } from '../../common/crypto/crypto';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { channelAccounts, oauthStates, plans, workspaces } from '../../database/schema';
import { ActivityService } from '../activity/activity.service';
import { InstagramGraphClient, MetaApiError } from '../instagram/instagram-graph.client';
import { INSTAGRAM_WEBHOOK_FIELDS, metaAvailability } from '../instagram/meta-config';

type Account = typeof channelAccounts.$inferSelect;

/** Campos seguros para o frontend. O token nunca sai daqui. */
export function toPublicAccount(a: Account) {
  return {
    id: a.id,
    channel: a.channel,
    externalId: a.externalId,
    username: a.username,
    name: a.name,
    profilePictureUrl: a.profilePictureUrl,
    accountType: a.accountType,
    status: a.status,
    grantedScopes: a.grantedScopes,
    tokenExpiresAt: a.tokenExpiresAt,
    tokenRefreshedAt: a.tokenRefreshedAt,
    lastError: a.lastError,
    lastErrorAt: a.lastErrorAt,
    lastCheckedAt: a.lastCheckedAt,
    webhookSubscribed: a.webhookSubscribed,
    webhookFields: a.webhookFields,
    connectedAt: a.connectedAt,
  };
}

const OAUTH_STATE_TTL_MS = 10 * 60_000;
const DAY = 86_400_000;

export type CallbackResult = { ok: true; workspaceSlug: string; accountId: string } | { ok: false; workspaceSlug?: string; error: string; message: string };

@Injectable()
export class ChannelAccountsService {
  private readonly logger = new Logger(ChannelAccountsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly box: SecretBox,
    private readonly graph: InstagramGraphClient,
    private readonly activity: ActivityService,
  ) {}

  availability() {
    const a = metaAvailability(this.env);
    return { instagram: { configured: a.configured, missing: a.missing, scopes: a.scopes, graphVersion: a.graphVersion, redirectUri: a.redirectUri, webhookUrl: a.webhookUrl } };
  }

  async list(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.workspaceId, workspaceId), isNull(channelAccounts.disconnectedAt)))
      .orderBy(asc(channelAccounts.connectedAt));
    return rows.map(toPublicAccount);
  }

  async limits(workspaceId: string) {
    const [row] = await this.db
      .select({ limits: plans.limits, planName: plans.name })
      .from(workspaces)
      .innerJoin(plans, eq(plans.id, workspaces.planId))
      .where(eq(workspaces.id, workspaceId));
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(channelAccounts)
      .where(and(eq(channelAccounts.workspaceId, workspaceId), isNull(channelAccounts.disconnectedAt)));
    return { max: row.limits.maxChannelAccounts, used: n, planName: row.planName };
  }

  /** Inicia o OAuth: grava um state de uso único e devolve a URL de autorização oficial do Instagram. */
  async startInstagramConnect(workspaceId: string, userId: string) {
    const a = metaAvailability(this.env);
    if (!a.configured) {
      throw new ServiceUnavailableException({
        code: 'meta_not_configured',
        message: 'A integração com a Meta ainda não foi configurada nesta plataforma.',
        missing: a.missing,
      });
    }
    const limit = await this.limits(workspaceId);
    if (limit.used >= limit.max) {
      throw new ForbiddenException({
        code: 'plan_limit_reached',
        message: `O plano ${limit.planName} permite ${limit.max} conta(s) conectada(s). Desconecte uma conta ou mude de plano.`,
      });
    }
    const state = randomToken(24);
    await this.db.insert(oauthStates).values({
      stateHash: sha256(state),
      channel: 'instagram',
      workspaceId,
      userId,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });
    return { authorizeUrl: this.graph.authorizeUrl(state) };
  }

  /** Conclui o OAuth. Nunca lança para fora: devolve um resultado para redirecionar o navegador. */
  async completeInstagramConnect(params: { code?: string; state?: string; error?: string; errorDescription?: string }, currentUserId?: string): Promise<CallbackResult> {
    if (!params.state) return { ok: false, error: 'invalid_state', message: 'Pedido de conexão inválido. Tente novamente.' };

    // Consome o state de forma atômica (uso único).
    const [st] = await this.db
      .update(oauthStates)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthStates.stateHash, sha256(params.state)), isNull(oauthStates.usedAt), gt(oauthStates.expiresAt, new Date())))
      .returning();
    if (!st) return { ok: false, error: 'invalid_state', message: 'O pedido de conexão expirou ou já foi usado. Tente novamente.' };

    const [ws] = await this.db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, st.workspaceId));
    const slug = ws?.slug;

    if (currentUserId && currentUserId !== st.userId) {
      return { ok: false, workspaceSlug: slug, error: 'user_mismatch', message: 'A conexão foi iniciada por outro usuário.' };
    }
    if (params.error || !params.code) {
      await this.activity.record({ workspaceId: st.workspaceId, actorUserId: st.userId, type: 'channel.connect_cancelled', level: 'warning', message: 'Conexão com o Instagram cancelada ou negada na Meta', metadata: { error: params.error, description: params.errorDescription } });
      return { ok: false, workspaceSlug: slug, error: params.error ?? 'missing_code', message: 'A autorização no Instagram foi cancelada ou negada.' };
    }

    try {
      const short = await this.graph.exchangeCode(params.code);
      const long = await this.graph.exchangeLongLived(short.accessToken);
      const profile = await this.graph.getMe(long.accessToken);
      const requested = metaAvailability(this.env).scopes;
      const granted = short.permissions?.length ? short.permissions : requested;

      const account = await this.upsertAccount(st.workspaceId, st.userId, profile, long.accessToken, long.expiresIn, granted);

      // Assinatura dos webhooks para esta conta. Falha aqui não desfaz a conexão, mas fica visível.
      await this.subscribe(account.id, long.accessToken);

      await this.activity.record({ workspaceId: st.workspaceId, actorUserId: st.userId, type: 'channel.connected', entityType: 'channel_account', entityId: account.id, message: `Instagram @${profile.username ?? profile.userId} conectado` });
      const missingScopes = requested.filter((s) => !granted.includes(s));
      if (missingScopes.length) {
        await this.activity.record({ workspaceId: st.workspaceId, type: 'channel.missing_scopes', level: 'warning', entityType: 'channel_account', entityId: account.id, message: `Permissões não concedidas: ${missingScopes.join(', ')}` });
      }
      return { ok: true, workspaceSlug: slug!, accountId: account.id };
    } catch (err) {
      const message = err instanceof ConflictException ? (err.getResponse() as { message: string }).message : describeMetaError(err);
      this.logger.warn(`Falha no callback do Instagram: ${(err as Error).message}`);
      await this.activity.record({ workspaceId: st.workspaceId, actorUserId: st.userId, type: 'channel.connect_failed', level: 'error', message: `Falha ao conectar Instagram: ${message}` });
      return { ok: false, workspaceSlug: slug, error: err instanceof ConflictException ? 'account_in_use' : 'connect_failed', message };
    }
  }

  private async upsertAccount(workspaceId: string, userId: string, profile: { userId: string; username?: string; name?: string; accountType?: string; profilePictureUrl?: string }, token: string, expiresIn: number | undefined, scopes: string[]) {
    const values = {
      username: profile.username ?? null,
      name: profile.name ?? null,
      accountType: profile.accountType ?? null,
      profilePictureUrl: profile.profilePictureUrl ?? null,
      accessTokenEnc: this.box.encrypt(token),
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      tokenRefreshedAt: new Date(),
      grantedScopes: scopes,
      status: 'connected' as const,
      lastError: null,
      lastErrorAt: null,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    };
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.channel, 'instagram'), eq(channelAccounts.externalId, profile.userId), isNull(channelAccounts.disconnectedAt)))
        .for('update');
      if (existing && existing.workspaceId !== workspaceId) {
        throw new ConflictException({ code: 'account_in_use', message: `A conta @${profile.username ?? profile.userId} já está conectada a outra empresa.` });
      }
      if (existing) {
        const [updated] = await tx.update(channelAccounts).set(values).where(eq(channelAccounts.id, existing.id)).returning();
        return updated;
      }
      const [created] = await tx
        .insert(channelAccounts)
        .values({ ...values, workspaceId, channel: 'instagram', externalId: profile.userId, connectedBy: userId })
        .returning();
      return created;
    });
  }

  private async subscribe(accountId: string, token: string) {
    try {
      const ok = await this.graph.subscribeWebhooks(token);
      await this.db
        .update(channelAccounts)
        .set({ webhookSubscribed: ok, webhookFields: ok ? [...INSTAGRAM_WEBHOOK_FIELDS] : [], lastError: ok ? null : 'A Meta não confirmou a assinatura dos webhooks.', lastErrorAt: ok ? null : new Date() })
        .where(eq(channelAccounts.id, accountId));
      return ok;
    } catch (err) {
      await this.db
        .update(channelAccounts)
        .set({ webhookSubscribed: false, webhookFields: [], lastError: `Webhooks não assinados: ${describeMetaError(err)}`, lastErrorAt: new Date() })
        .where(eq(channelAccounts.id, accountId));
      return false;
    }
  }

  async get(workspaceId: string, id: string) {
    const [acc] = await this.db
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.id, id), eq(channelAccounts.workspaceId, workspaceId), isNull(channelAccounts.disconnectedAt)));
    if (!acc) throw new NotFoundException({ code: 'account_not_found', message: 'Conta não encontrada.' });
    return acc;
  }

  decryptToken(acc: Account) {
    if (!acc.accessTokenEnc) throw new Error('Conta sem token armazenado');
    return this.box.decrypt(acc.accessTokenEnc);
  }

  /** Verifica a conexão consultando a Meta e atualiza status/perfil. Também reassina webhooks se necessário. */
  async check(workspaceId: string, id: string, userId?: string) {
    const acc = await this.get(workspaceId, id);
    try {
      const token = this.decryptToken(acc);
      const profile = await this.graph.getMe(token);
      await this.db
        .update(channelAccounts)
        .set({ username: profile.username ?? acc.username, name: profile.name ?? acc.name, profilePictureUrl: profile.profilePictureUrl ?? acc.profilePictureUrl, status: 'connected', lastCheckedAt: new Date(), updatedAt: new Date(), ...(acc.webhookSubscribed ? { lastError: null, lastErrorAt: null } : {}) })
        .where(eq(channelAccounts.id, acc.id));
      if (!acc.webhookSubscribed) await this.subscribe(acc.id, token);
    } catch (err) {
      await this.markError(acc, err);
    }
    await this.activity.record({ workspaceId, actorUserId: userId, type: 'channel.checked', entityType: 'channel_account', entityId: acc.id, message: `Status da conta @${acc.username ?? acc.externalId} verificado` });
    return toPublicAccount(await this.get(workspaceId, id));
  }

  /** Renova o token de longa duração de uma conta. */
  async refreshToken(acc: Account, actorUserId?: string) {
    try {
      const result = await this.graph.refreshLongLived(this.decryptToken(acc));
      await this.db
        .update(channelAccounts)
        .set({ accessTokenEnc: this.box.encrypt(result.accessToken), tokenExpiresAt: result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : acc.tokenExpiresAt, tokenRefreshedAt: new Date(), status: 'connected', updatedAt: new Date() })
        .where(eq(channelAccounts.id, acc.id));
      await this.activity.record({ workspaceId: acc.workspaceId, actorUserId, type: 'channel.token_refreshed', entityType: 'channel_account', entityId: acc.id, message: `Token da conta @${acc.username ?? acc.externalId} renovado` });
      return true;
    } catch (err) {
      await this.markError(acc, err);
      return false;
    }
  }

  async refreshTokenById(workspaceId: string, id: string, userId: string) {
    const acc = await this.get(workspaceId, id);
    if (acc.tokenRefreshedAt && Date.now() - acc.tokenRefreshedAt.getTime() < DAY) {
      throw new ConflictException({ code: 'token_too_recent', message: 'O token foi emitido há menos de 24 horas; a Meta só permite renová-lo depois disso.' });
    }
    await this.refreshToken(acc, userId);
    return toPublicAccount(await this.get(workspaceId, id));
  }

  /** Contas cujo token vence nos próximos `withinDays` dias e já podem ser renovadas. */
  async accountsNeedingRefresh(withinDays = 10) {
    return this.db
      .select()
      .from(channelAccounts)
      .where(
        and(
          isNull(channelAccounts.disconnectedAt),
          eq(channelAccounts.status, 'connected'),
          lt(channelAccounts.tokenExpiresAt, new Date(Date.now() + withinDays * DAY)),
          gt(channelAccounts.tokenExpiresAt, new Date()),
          lt(channelAccounts.tokenRefreshedAt, new Date(Date.now() - DAY)),
        ),
      );
  }

  /** Marca como expiradas as contas cujo token já venceu. */
  async expireOverdueTokens() {
    const rows = await this.db
      .update(channelAccounts)
      .set({ status: 'token_expired', lastError: 'O token de acesso expirou. Reconecte a conta.', lastErrorAt: new Date(), updatedAt: new Date() })
      .where(and(isNull(channelAccounts.disconnectedAt), ne(channelAccounts.status, 'token_expired'), lt(channelAccounts.tokenExpiresAt, new Date())))
      .returning();
    for (const acc of rows) {
      await this.activity.record({ workspaceId: acc.workspaceId, type: 'channel.token_expired', level: 'error', entityType: 'channel_account', entityId: acc.id, message: `Token da conta @${acc.username ?? acc.externalId} expirou. Reconecte a conta.` });
    }
    return rows.length;
  }

  async markError(acc: Account, err: unknown) {
    const isAuth = err instanceof MetaApiError && err.isAuthError;
    const message = describeMetaError(err);
    await this.db
      .update(channelAccounts)
      .set({ status: isAuth ? 'revoked' : 'error', lastError: message, lastErrorAt: new Date(), lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(channelAccounts.id, acc.id));
    await this.activity.record({ workspaceId: acc.workspaceId, type: isAuth ? 'channel.auth_failed' : 'channel.error', level: 'error', entityType: 'channel_account', entityId: acc.id, message: `Conta @${acc.username ?? acc.externalId}: ${message}` });
  }

  /** Desconecta: cancela os webhooks na Meta (melhor esforço) e apaga o token armazenado. */
  async disconnect(workspaceId: string, id: string, userId: string) {
    const acc = await this.get(workspaceId, id);
    let unsubscribed = false;
    if (acc.accessTokenEnc && metaAvailability(this.env).configured) {
      try {
        unsubscribed = await this.graph.unsubscribeWebhooks(this.decryptToken(acc));
      } catch (err) {
        this.logger.warn(`Não foi possível cancelar webhooks da conta ${acc.id}: ${(err as Error).message}`);
      }
    }
    await this.db
      .update(channelAccounts)
      .set({ status: 'disconnected', disconnectedAt: new Date(), accessTokenEnc: null, webhookSubscribed: false, webhookFields: [], updatedAt: new Date() })
      .where(eq(channelAccounts.id, acc.id));
    await this.activity.record({ workspaceId, actorUserId: userId, type: 'channel.disconnected', entityType: 'channel_account', entityId: acc.id, message: `Instagram @${acc.username ?? acc.externalId} desconectado`, metadata: { webhooksCancelled: unsubscribed } });
  }
}

export function describeMetaError(err: unknown): string {
  if (err instanceof MetaApiError) {
    if (err.isAuthError) return 'A autorização foi revogada ou expirou. Reconecte a conta.';
    if (err.isRateLimit) return 'Limite de requisições da Meta atingido. Tente novamente em alguns minutos.';
    return `Erro da Meta: ${err.message}${err.code ? ` (código ${err.code})` : ''}`;
  }
  return (err as Error)?.message ?? 'Erro desconhecido';
}
