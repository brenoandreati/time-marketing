'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtNumber } from '@/lib/format';
import type { DashboardResponse } from '@/lib/types';
import { Card, CardHeader } from './ui';

type Series = DashboardResponse['series'];

const AXIS = { fontSize: 12, fill: 'var(--color-ink-3)' };
const dayLabel = (d: string) => {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
};

function ChartTooltip({ active, payload, label, names }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string; names: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md shadow-black/5">
      <p className="mb-1 font-medium text-ink">{label ? dayLabel(label) : ''}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
          {names[p.dataKey]}: <span className="font-medium text-ink">{fmtNumber(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function TableToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="text-[13px] font-medium text-ink-3 hover:text-ink">
      {table ? 'Ver gráfico' : 'Ver tabela'}
    </button>
  );
}

function DataTable({ series, columns }: { series: Series; columns: { key: keyof Series[number]; label: string }[] }) {
  return (
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
          <tr>
            <th className="py-2 font-medium">Dia</th>
            {columns.map((c) => (
              <th key={c.key} className="py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((r) => (
            <tr key={r.day} className="border-t border-line">
              <td className="py-1.5 text-ink-2">{dayLabel(r.day)}</td>
              {columns.map((c) => (
                <td key={c.key} className="py-1.5 text-right tabular-nums">
                  {fmtNumber(r[c.key] as number)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MessagesChart({ series }: { series: Series }) {
  const [table, setTable] = useState(false);
  const names = { inbound: 'Recebidas', outbound: 'Enviadas' };
  return (
    <Card>
      <CardHeader title="Mensagens por dia" description="Mensagens diretas recebidas e enviadas" action={<TableToggle table={table} onToggle={() => setTable((t) => !t)} />} />
      <div className="px-3 pb-3 pt-4 sm:px-5">
        <div className="mb-3 flex gap-4 text-xs text-ink-2" aria-hidden={table}>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-series-1" /> Recebidas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-series-2" /> Enviadas
          </span>
        </div>
        {table ? (
          <DataTable series={series} columns={[{ key: 'inbound', label: 'Recebidas' }, { key: 'outbound', label: 'Enviadas' }]} />
        ) : (
          <div className="h-[240px]" role="img" aria-label="Gráfico de linhas com mensagens recebidas e enviadas por dia">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip names={names} />} cursor={{ stroke: 'var(--color-line-strong)' }} />
                <Line isAnimationActive={false} type="monotone" dataKey="inbound" stroke="var(--color-series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)' }} />
                <Line isAnimationActive={false} type="monotone" dataKey="outbound" stroke="var(--color-series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ContactsChart({ series }: { series: Series }) {
  const [table, setTable] = useState(false);
  return (
    <Card>
      <CardHeader title="Novos contatos por dia" description="Primeira interação com a empresa" action={<TableToggle table={table} onToggle={() => setTable((t) => !t)} />} />
      <div className="px-3 pb-3 pt-4 sm:px-5">
        {table ? (
          <DataTable series={series} columns={[{ key: 'newContacts', label: 'Novos contatos' }]} />
        ) : (
          <div className="h-[264px]" role="img" aria-label="Gráfico de barras com novos contatos por dia">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip names={{ newContacts: 'Novos contatos' }} />} cursor={{ fill: 'var(--color-subtle)' }} />
                <Bar isAnimationActive={false} dataKey="newContacts" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
