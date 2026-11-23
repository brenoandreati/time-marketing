import { describe, expect, it } from 'vitest';
import { SecretBox, verifyMetaSignature } from '../src/common/crypto/crypto';
import { resolvePeriod } from '../src/modules/dashboard/period';
import { mapInstagramMessage } from '../src/modules/inbound/message-mapper';
import { MetaApiError } from '../src/modules/instagram/instagram-graph.client';
import { parseInstagramWebhook, WebhookPayloadError } from '../src/modules/webhooks/instagram-webhook.parser';
import { can } from '../src/modules/workspaces/permissions';
import { slugify } from '../src/modules/workspaces/workspaces.service';
import { sign } from './helpers';

describe('SecretBox', () => {
  const box = new SecretBox(Buffer.alloc(32, 1).toString('base64'));

  it('criptografa e descriptografa', () => {
    const enc = box.encrypt('token-secreto');
    expect(enc).not.toContain('token-secreto');
    expect(box.decrypt(enc)).toBe('token-secreto');
  });

  it('gera IV diferente a cada chamada', () => {
    expect(box.encrypt('x')).not.toBe(box.encrypt('x'));
  });

  it('detecta adulteração', () => {
    const parts = box.encrypt('token').split('.');
    parts[3] = Buffer.from('outro').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
  });

  it('rejeita chave com tamanho errado', () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('verifyMetaSignature', () => {
  const body = Buffer.from('{"object":"instagram"}');
  it('aceita assinatura correta', () => expect(verifyMetaSignature(body, sign(body.toString()), 'test-app-secret')).toBe(true));
  it('rejeita segredo errado', () => expect(verifyMetaSignature(body, sign(body.toString(), 'outro'), 'test-app-secret')).toBe(false));
  it('rejeita cabeçalho ausente ou malformado', () => {
    expect(verifyMetaSignature(body, undefined, 's')).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abc', 's')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=zz', 's')).toBe(false);
  });
});

describe('parseInstagramWebhook', () => {
  const payload = {
    object: 'instagram',
    entry: [
      {
        id: '178400',
        time: 1700000000000,
        messaging: [
          { sender: { id: 'u1' }, recipient: { id: '178400' }, timestamp: 1700000000000, message: { mid: 'm1', text: 'PREÇO' } },
          { sender: { id: '178400' }, recipient: { id: 'u1' }, timestamp: 1700000001000, message: { mid: 'm2', text: 'oi', is_echo: true } },
          { sender: { id: 'u1' }, recipient: { id: '178400' }, timestamp: 1700000002000, read: { mid: 'm2' } },
          { sender: { id: 'u1' }, recipient: { id: '178400' }, timestamp: 1700000003000, reaction: { mid: 'm2', action: 'react', reaction: 'love' } },
        ],
        changes: [{ field: 'comments', value: { id: 'c1', text: 'quero', from: { id: 'u2', username: 'maria' }, media: { id: 'media1' } } }],
      },
    ],
  };

  it('normaliza todos os itens com tipo e chave de deduplicação', () => {
    const items = parseInstagramWebhook(payload);
    expect(items.map((i) => [i.eventType, i.dedupeKey])).toEqual([
      ['message', 'message:m1'],
      ['message_echo', 'message:m2'],
      ['read', 'read:m2:u1'],
      ['reaction', 'reaction:m2:u1:react:love:1700000003000'],
      ['comment', 'comment:c1'],
    ]);
    expect(items[0].recipientExternalId).toBe('178400');
    expect(items[0].occurredAt?.toISOString()).toBe(new Date(1700000000000).toISOString());
  });

  it('gera a mesma chave para o mesmo evento reenviado', () => {
    const a = parseInstagramWebhook(payload).map((i) => i.dedupeKey);
    const b = parseInstagramWebhook(JSON.parse(JSON.stringify(payload))).map((i) => i.dedupeKey);
    expect(a).toEqual(b);
  });

  it('rejeita objetos que não são do Instagram', () => {
    expect(() => parseInstagramWebhook({ object: 'page', entry: [] })).toThrow(WebhookPayloadError);
    expect(() => parseInstagramWebhook(null)).toThrow(WebhookPayloadError);
  });
});

describe('mapInstagramMessage', () => {
  it('identifica texto, mídia, resposta e menção em story', () => {
    expect(mapInstagramMessage({ message: { text: 'oi' } })).toMatchObject({ type: 'text', text: 'oi', source: 'dm' });
    expect(mapInstagramMessage({ message: { attachments: [{ type: 'image', payload: { url: 'x' } }] } })).toMatchObject({ type: 'image', source: 'dm' });
    expect(mapInstagramMessage({ message: { text: 'lindo', reply_to: { story: { id: 's1' } } } })).toMatchObject({ type: 'story_reply', source: 'story_reply' });
    expect(mapInstagramMessage({ message: { attachments: [{ type: 'story_mention', payload: {} }] } })).toMatchObject({ type: 'story_mention', source: 'story_mention' });
  });
});

describe('MetaApiError', () => {
  it('classifica erros de autenticação e limite', () => {
    expect(new MetaApiError('x', 400, 190, undefined, 'OAuthException').isAuthError).toBe(true);
    expect(new MetaApiError('x', 400, 4).isRateLimit).toBe(true);
    expect(new MetaApiError('x', 500).isTransient).toBe(true);
    expect(new MetaApiError('x', 400, 100).isAuthError).toBe(false);
  });
});

describe('permissões por função', () => {
  it('aplica a matriz de acesso', () => {
    expect(can('admin', 'workspace.manage')).toBe(true);
    expect(can('manager', 'channels.manage')).toBe(true);
    expect(can('manager', 'members.manage')).toBe(false);
    expect(can('agent', 'channels.manage')).toBe(false);
    expect(can('agent', 'conversations.reply')).toBe(true);
    expect(can('analyst', 'reports.read')).toBe(true);
    expect(can('analyst', 'contacts.manage')).toBe(false);
    expect(can('viewer', 'automations.manage')).toBe(false);
  });
});

describe('resolvePeriod', () => {
  const now = new Date('2026-03-15T15:00:00Z'); // 12:00 em São Paulo
  const tz = 'America/Sao_Paulo';

  it('hoje vai da meia-noite local até a meia-noite seguinte', () => {
    const p = resolvePeriod('today', tz, {}, now);
    expect(p.from.toISOString()).toBe('2026-03-15T03:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-03-16T03:00:00.000Z');
  });

  it('últimos 7 dias inclui hoje', () => {
    const p = resolvePeriod('7d', tz, {}, now);
    expect(p.from.toISOString()).toBe('2026-03-09T03:00:00.000Z');
  });

  it('este mês começa no dia 1', () => {
    expect(resolvePeriod('month', tz, {}, now).from.toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });

  it('personalizado valida as datas', () => {
    const p = resolvePeriod('custom', tz, { from: '2026-01-01', to: '2026-01-31' }, now);
    expect(p.from.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-02-01T03:00:00.000Z');
    expect(() => resolvePeriod('custom', tz, { from: '2026-02-01', to: '2026-01-01' }, now)).toThrow();
    expect(() => resolvePeriod('custom', tz, { from: 'ontem' }, now)).toThrow();
    expect(() => resolvePeriod('xyz', tz, {}, now)).toThrow();
  });
});

describe('slugify', () => {
  it('remove acentos e caracteres especiais', () => {
    expect(slugify('Loja da Ana & Cia — Vitória')).toBe('loja-da-ana-cia-vitoria');
    expect(slugify('!!!')).toBe('empresa');
  });
});
