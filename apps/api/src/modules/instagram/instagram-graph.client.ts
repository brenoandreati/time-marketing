import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { INSTAGRAM_WEBHOOK_FIELDS, metaAvailability } from './meta-config';

/** Erro devolvido pela Graph API, com a classificação que o resto do sistema precisa. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly type?: string,
    readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }

  /** Token inválido, expirado ou revogado: a conta precisa ser reconectada. */
  get isAuthError() {
    return this.code === 190 || (this.type === 'OAuthException' && (this.status === 401 || this.code === 102));
  }

  /** Limite de requisições: vale tentar de novo mais tarde. */
  get isRateLimit() {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613 || this.status === 429;
  }

  get isTransient() {
    return this.isRateLimit || this.status >= 500 || this.code === 1 || this.code === 2;
  }
}

export type TokenResult = { accessToken: string; expiresIn?: number; userId?: string; permissions?: string[] };
export type InstagramProfile = { userId: string; appScopedId?: string; username?: string; name?: string; accountType?: string; profilePictureUrl?: string };

const OAUTH_AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const OAUTH_TOKEN = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

type FetchFn = typeof fetch;

/**
 * Cliente da Instagram API com Login do Instagram (API oficial da Meta).
 * Toda chamada usa HTTPS para os domínios oficiais; nada de scraping ou login simulado.
 */
@Injectable()
export class InstagramGraphClient {
  private fetchFn: FetchFn = fetch;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Permite injetar um fetch nos testes. */
  useFetch(fn: FetchFn) {
    this.fetchFn = fn;
  }

  private get version() {
    return this.env.META_GRAPH_VERSION;
  }

  authorizeUrl(state: string) {
    const a = metaAvailability(this.env);
    const params = new URLSearchParams({
      client_id: this.env.META_APP_ID!,
      redirect_uri: a.redirectUri,
      response_type: 'code',
      scope: a.scopes.join(','),
      state,
      enable_fb_login: '0',
      force_authentication: '1',
    });
    return `${OAUTH_AUTHORIZE}?${params}`;
  }

  /** Troca o código do OAuth por um token de curta duração. */
  async exchangeCode(code: string): Promise<TokenResult> {
    const a = metaAvailability(this.env);
    const body = new URLSearchParams({
      client_id: this.env.META_APP_ID!,
      client_secret: this.env.META_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: a.redirectUri,
      code: code.replace(/#_$/, ''),
    });
    const json = await this.request<any>(OAUTH_TOKEN, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const item = Array.isArray(json?.data) ? json.data[0] : json;
    if (!item?.access_token) throw new MetaApiError('Resposta de token sem access_token', 502);
    const permissions = typeof item.permissions === 'string' ? item.permissions.split(',') : Array.isArray(item.permissions) ? item.permissions : undefined;
    return { accessToken: item.access_token, userId: item.user_id ? String(item.user_id) : undefined, permissions };
  }

  /** Converte o token de curta duração em um token de longa duração (~60 dias). */
  async exchangeLongLived(shortToken: string): Promise<TokenResult> {
    const params = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: this.env.META_APP_SECRET!, access_token: shortToken });
    const json = await this.request<any>(`${GRAPH}/access_token?${params}`);
    return { accessToken: json.access_token, expiresIn: json.expires_in };
  }

  /** Renova um token de longa duração (precisa ter pelo menos 24h e ainda estar válido). */
  async refreshLongLived(token: string): Promise<TokenResult> {
    const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
    const json = await this.request<any>(`${GRAPH}/refresh_access_token?${params}`);
    return { accessToken: json.access_token, expiresIn: json.expires_in };
  }

  async getMe(token: string): Promise<InstagramProfile> {
    const params = new URLSearchParams({ fields: 'id,user_id,username,name,account_type,profile_picture_url', access_token: token });
    const json = await this.request<any>(`${GRAPH}/${this.version}/me?${params}`);
    return {
      userId: String(json.user_id ?? json.id),
      appScopedId: json.id ? String(json.id) : undefined,
      username: json.username,
      name: json.name,
      accountType: json.account_type,
      profilePictureUrl: json.profile_picture_url,
    };
  }

  async subscribeWebhooks(token: string, fields: readonly string[] = INSTAGRAM_WEBHOOK_FIELDS) {
    const params = new URLSearchParams({ subscribed_fields: fields.join(','), access_token: token });
    const json = await this.request<any>(`${GRAPH}/${this.version}/me/subscribed_apps?${params}`, { method: 'POST' });
    return json?.success === true;
  }

  async unsubscribeWebhooks(token: string) {
    const params = new URLSearchParams({ access_token: token });
    const json = await this.request<any>(`${GRAPH}/${this.version}/me/subscribed_apps?${params}`, { method: 'DELETE' });
    return json?.success === true;
  }

  /** Perfil de quem enviou a mensagem (IGSID). Disponível quando o usuário interagiu com a conta. */
  async getUserProfile(token: string, igsid: string): Promise<{ name?: string; username?: string; profilePic?: string }> {
    const params = new URLSearchParams({ fields: 'name,username,profile_pic', access_token: token });
    const json = await this.request<any>(`${GRAPH}/${this.version}/${encodeURIComponent(igsid)}?${params}`);
    return { name: json.name, username: json.username, profilePic: json.profile_pic };
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new MetaApiError(`Falha de rede ao chamar a Meta: ${(err as Error).message}`, 503);
    }
    const text = await res.text();
    let json: any = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      /* corpo não-JSON */
    }
    if (!res.ok || json?.error) {
      const e = json?.error ?? {};
      const message = e.error_user_msg || e.message || json?.error_message || `HTTP ${res.status}`;
      throw new MetaApiError(message, res.status, e.code ?? json?.code, e.error_subcode, e.type ?? json?.error_type, e.fbtrace_id);
    }
    return json as T;
  }
}
