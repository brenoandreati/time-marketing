import { createHash } from 'node:crypto';

/**
 * Normaliza o corpo de um webhook do Instagram em itens independentes.
 * Cada item tem uma chave de deduplicação estável: a Meta pode reenviar o mesmo evento
 * (inclusive agrupado de forma diferente) e ele precisa ser processado uma única vez.
 */
export type NormalizedEventType =
  | 'message'
  | 'message_echo'
  | 'message_deleted'
  | 'message_edit'
  | 'reaction'
  | 'read'
  | 'postback'
  | 'referral'
  | 'optin'
  | 'comment'
  | 'live_comment'
  | 'mention'
  | 'change'
  | 'unknown';

export type NormalizedWebhookItem = {
  eventType: NormalizedEventType;
  dedupeKey: string;
  recipientExternalId: string;
  occurredAt: Date | null;
  payload: Record<string, unknown>;
};

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

function toDate(ms: unknown): Date | null {
  const n = typeof ms === 'number' ? ms : typeof ms === 'string' ? Number(ms) : NaN;
  if (!Number.isFinite(n)) return null;
  // A Meta envia milissegundos em messaging e segundos em alguns campos de changes.
  return new Date(n < 1e12 ? n * 1000 : n);
}

export class WebhookPayloadError extends Error {}

export function parseInstagramWebhook(body: unknown): NormalizedWebhookItem[] {
  if (!body || typeof body !== 'object') throw new WebhookPayloadError('Corpo vazio');
  const b = body as { object?: string; entry?: unknown };
  if (b.object !== 'instagram') throw new WebhookPayloadError(`Objeto não suportado: ${String(b.object)}`);
  if (!Array.isArray(b.entry)) throw new WebhookPayloadError('Campo entry ausente');

  const items: NormalizedWebhookItem[] = [];
  for (const entry of b.entry as any[]) {
    const recipient = entry?.id != null ? String(entry.id) : null;
    if (!recipient) continue;

    for (const m of Array.isArray(entry.messaging) ? entry.messaging : []) {
      items.push(normalizeMessaging(recipient, m, entry.time));
    }
    for (const c of Array.isArray(entry.changes) ? entry.changes : []) {
      items.push(normalizeChange(recipient, c, entry.time));
    }
  }
  return items;
}

function normalizeMessaging(recipient: string, m: any, entryTime: unknown): NormalizedWebhookItem {
  const occurredAt = toDate(m?.timestamp ?? entryTime);
  const base = { recipientExternalId: recipient, occurredAt, payload: m as Record<string, unknown> };
  const sender = m?.sender?.id != null ? String(m.sender.id) : 'unknown';

  if (m?.message) {
    const mid = m.message.mid;
    if (m.message.is_deleted) return { ...base, eventType: 'message_deleted', dedupeKey: `message_deleted:${mid ?? hash(m)}` };
    if (m.message.is_echo) return { ...base, eventType: 'message_echo', dedupeKey: `message:${mid ?? hash(m)}` };
    return { ...base, eventType: 'message', dedupeKey: `message:${mid ?? hash(m)}` };
  }
  if (m?.message_edit) return { ...base, eventType: 'message_edit', dedupeKey: `message_edit:${m.message_edit.mid}:${m.message_edit.num_edit ?? hash(m)}` };
  if (m?.reaction) return { ...base, eventType: 'reaction', dedupeKey: `reaction:${m.reaction.mid}:${sender}:${m.reaction.action}:${m.reaction.reaction ?? m.reaction.emoji ?? ''}:${m.timestamp ?? ''}` };
  if (m?.read) return { ...base, eventType: 'read', dedupeKey: `read:${m.read.mid ?? hash(m)}:${sender}` };
  if (m?.postback) return { ...base, eventType: 'postback', dedupeKey: `postback:${m.postback.mid ?? hash(m)}` };
  if (m?.referral) return { ...base, eventType: 'referral', dedupeKey: `referral:${sender}:${m.timestamp ?? hash(m)}` };
  if (m?.optin) return { ...base, eventType: 'optin', dedupeKey: `optin:${sender}:${m.timestamp ?? hash(m)}` };
  return { ...base, eventType: 'unknown', dedupeKey: `messaging:${hash(m)}` };
}

function normalizeChange(recipient: string, c: any, entryTime: unknown): NormalizedWebhookItem {
  const field = String(c?.field ?? 'unknown');
  const value = c?.value ?? {};
  const occurredAt = toDate(value?.timestamp ?? entryTime);
  const base = { recipientExternalId: recipient, occurredAt, payload: c as Record<string, unknown> };
  if (field === 'comments' && value.id) return { ...base, eventType: 'comment', dedupeKey: `comment:${value.id}` };
  if (field === 'live_comments' && value.id) return { ...base, eventType: 'live_comment', dedupeKey: `live_comment:${value.id}` };
  if (field === 'mentions') return { ...base, eventType: 'mention', dedupeKey: `mention:${value.comment_id ?? value.media_id ?? hash(c)}` };
  return { ...base, eventType: 'change', dedupeKey: `change:${field}:${hash(c)}` };
}
