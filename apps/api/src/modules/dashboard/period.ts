/**
 * Converte o filtro do painel em um intervalo [from, to) respeitando o fuso da empresa.
 * Presets: today, 7d, 30d, month, custom (from/to no formato YYYY-MM-DD, inclusivos).
 */
export type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const DAY = 86_400_000;

/** Deslocamento (ms) do fuso em relação ao UTC em um instante. */
function tzOffset(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Meia-noite local (no fuso) de uma data Y-M-D, como instante UTC. */
export function localMidnight(y: number, m: number, d: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d);
  const off = tzOffset(new Date(guess), tz);
  const first = guess - off;
  // Ajuste para transições de horário de verão.
  const off2 = tzOffset(new Date(first), tz);
  return new Date(guess - off2);
}

function localYmd(at: Date, tz: string) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export class PeriodError extends Error {}

export function resolvePeriod(preset: string | undefined, tz: string, custom: { from?: string; to?: string } = {}, now = new Date()) {
  const p = (preset ?? '7d') as PeriodPreset;
  const today = localYmd(now, tz);
  const startToday = localMidnight(today.y, today.m, today.d, tz);
  const endToday = new Date(startToday.getTime() + DAY + 2 * 3600_000); // margem para DST
  const tomorrow = localYmd(endToday, tz);
  const endExclusive = localMidnight(tomorrow.y, tomorrow.m, tomorrow.d, tz);

  switch (p) {
    case 'today':
      return { preset: p, from: startToday, to: endExclusive };
    case '7d':
    case '30d': {
      const days = p === '7d' ? 7 : 30;
      const start = localYmd(new Date(startToday.getTime() - (days - 1) * DAY + 12 * 3600_000), tz);
      return { preset: p, from: localMidnight(start.y, start.m, start.d, tz), to: endExclusive };
    }
    case 'month':
      return { preset: p, from: localMidnight(today.y, today.m, 1, tz), to: endExclusive };
    case 'custom': {
      const re = /^(\d{4})-(\d{2})-(\d{2})$/;
      const f = custom.from?.match(re);
      const t = custom.to?.match(re);
      if (!f || !t) throw new PeriodError('Informe as datas inicial e final (AAAA-MM-DD).');
      const from = localMidnight(+f[1], +f[2], +f[3], tz);
      const toStart = localMidnight(+t[1], +t[2], +t[3], tz);
      const next = localYmd(new Date(toStart.getTime() + DAY + 2 * 3600_000), tz);
      const to = localMidnight(next.y, next.m, next.d, tz);
      if (to <= from) throw new PeriodError('A data final precisa ser igual ou posterior à inicial.');
      if (to.getTime() - from.getTime() > 366 * DAY) throw new PeriodError('O período máximo é de 1 ano.');
      return { preset: p, from, to };
    }
    default:
      throw new PeriodError('Período inválido.');
  }
}
