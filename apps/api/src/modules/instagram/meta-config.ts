import type { Env } from '../../config/env';

/** Campos de webhook assinados para cada conta conectada (Instagram API com Login do Instagram). */
export const INSTAGRAM_WEBHOOK_FIELDS = ['messages', 'messaging_postbacks', 'messaging_seen', 'message_reactions', 'comments'] as const;

export type MetaAvailability = {
  configured: boolean;
  missing: string[];
  graphVersion: string;
  scopes: string[];
  redirectUri: string;
  webhookUrl: string;
};

/**
 * Diz se a integração com a Meta pode ser usada neste ambiente. Sem App ID / Secret / Verify Token
 * a plataforma não tenta conectar contas nem simula conexão: a interface explica o que falta.
 */
export function metaAvailability(env: Env): MetaAvailability {
  const missing: string[] = [];
  if (!env.META_APP_ID) missing.push('META_APP_ID');
  if (!env.META_APP_SECRET) missing.push('META_APP_SECRET');
  if (!env.META_WEBHOOK_VERIFY_TOKEN) missing.push('META_WEBHOOK_VERIFY_TOKEN');
  return {
    configured: missing.length === 0,
    missing,
    graphVersion: env.META_GRAPH_VERSION,
    scopes: env.META_SCOPES.split(',').map((s) => s.trim()).filter(Boolean),
    redirectUri: `${env.API_PUBLIC_URL}/integrations/instagram/callback`,
    webhookUrl: `${env.API_PUBLIC_URL}/webhooks/instagram`,
  };
}
