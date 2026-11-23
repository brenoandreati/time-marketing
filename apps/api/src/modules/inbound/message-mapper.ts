/** Converte a mensagem recebida da Meta no formato interno (tipo, texto, origem do contato). */
export type MappedMessage = { type: string; text: string | null; source: string; payload: Record<string, unknown> };

export function mapInstagramMessage(m: any): MappedMessage {
  const msg = m?.message ?? {};
  const attachments: any[] = Array.isArray(msg.attachments) ? msg.attachments : [];
  const first = attachments[0];
  const payload: Record<string, unknown> = {};
  if (attachments.length) payload.attachments = attachments;
  if (msg.quick_reply) payload.quickReply = msg.quick_reply;
  if (msg.reply_to) payload.replyTo = msg.reply_to;
  if (msg.referral ?? m?.referral) payload.referral = msg.referral ?? m.referral;

  let source = 'dm';
  if (msg.referral ?? m?.referral) source = 'ad_or_link';

  if (first?.type === 'story_mention') {
    return { type: 'story_mention', text: msg.text ?? null, source: 'story_mention', payload };
  }
  if (msg.reply_to?.story) {
    return { type: 'story_reply', text: msg.text ?? null, source: 'story_reply', payload };
  }
  if (typeof msg.text === 'string' && msg.text.length) {
    return { type: 'text', text: msg.text, source, payload };
  }
  if (first?.type) {
    const known = ['image', 'video', 'audio', 'file', 'share', 'ig_reel', 'reel', 'story', 'sticker', 'animated_image', 'template', 'fallback'];
    return { type: known.includes(first.type) ? first.type : 'attachment', text: null, source, payload };
  }
  if (msg.is_unsupported) return { type: 'unsupported', text: null, source, payload };
  return { type: 'unknown', text: null, source, payload };
}

/** Texto curto para listas e feed de atividades. */
export function previewOf(mapped: MappedMessage) {
  if (mapped.text) return mapped.text.slice(0, 80);
  const labels: Record<string, string> = {
    image: '[imagem]', video: '[vídeo]', audio: '[áudio]', file: '[arquivo]', share: '[compartilhamento]',
    ig_reel: '[reel]', reel: '[reel]', story_mention: '[menção no story]', story_reply: '[resposta ao story]', sticker: '[figurinha]',
  };
  return labels[mapped.type] ?? `[${mapped.type}]`;
}
