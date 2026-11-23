'use client';

import clsx from 'clsx';
import { ArrowRight, Camera as Instagram } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ActivityFeed } from '@/components/activity-feed';
import { ContactsChart, MessagesChart } from '@/components/dashboard-charts';
import { Button, Card, ErrorState, Input, PageHeader, Skeleton } from '@/components/ui';
import { useWorkspace } from '@/components/workspace-context';
import { fetcher } from '@/lib/api';
import { fmtDate, fmtNumber, fmtPercent } from '@/lib/format';
import type { ChannelAccountsResponse, DashboardMetrics, DashboardResponse } from '@/lib/types';

const PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
] as const;

type Kpi = { key: keyof DashboardMetrics; label: string; hint: string; format?: 'percent'; scope: 'period' | 'now' };

const KPIS: Kpi[] = [
  { key: 'totalContacts', label: 'Contatos', hint: 'Total cadastrado', scope: 'now' },
  { key: 'newContacts', label: 'Novos contatos', hint: 'Primeira interação no período', scope: 'period' },
  { key: 'conversationsReceived', label: 'Conversas recebidas', hint: 'Com mensagem do contato no período', scope: 'period' },
  { key: 'conversationsAutoAnswered', label: 'Respondidas automaticamente', hint: 'Por automação ou IA no período', scope: 'period' },
  { key: 'conversationsWaitingAgent', label: 'Aguardando atendimento', hint: 'Situação atual', scope: 'now' },
  { key: 'activeAutomations', label: 'Automações ativas', hint: 'Situação atual', scope: 'now' },
  { key: 'messagesSent', label: 'Mensagens enviadas', hint: 'Pela plataforma ou pelo app', scope: 'period' },
  { key: 'leadsCaptured', label: 'Leads capturados', hint: 'Informaram e-mail ou telefone', scope: 'period' },
  { key: 'responseRate', label: 'Taxa de resposta', hint: 'Conversas recebidas que tiveram resposta', format: 'percent', scope: 'period' },
  { key: 'conversionRate', label: 'Taxa de conversão', hint: 'Conversões ÷ novos contatos', format: 'percent', scope: 'period' },
];

function today() {
  return new Date().toLocaleDateString('en-CA');
}

export default function DashboardPage() {
  const { workspace, can } = useWorkspace();
  const [preset, setPreset] = useState<string>('7d');
  const [custom, setCustom] = useState({ from: '', to: today() });
  const [applied, setApplied] = useState({ from: '', to: '' });

  const query = preset === 'custom' ? (applied.from && applied.to ? `period=custom&from=${applied.from}&to=${applied.to}` : null) : `period=${preset}`;
  const { data, error, isLoading, mutate } = useSWR<DashboardResponse>(query ? `/workspaces/${workspace.id}/dashboard?${query}` : null, fetcher, { keepPreviousData: true });
  const accounts = useSWR<ChannelAccountsResponse>(can('channels.read') ? `/workspaces/${workspace.id}/channel-accounts` : null, fetcher);
  const noAccounts = accounts.data && accounts.data.accounts.length === 0;

  return (
    <>
      <PageHeader
        title="Painel"
        description={data ? `${fmtDate(data.period.from)} – ${fmtDate(new Date(new Date(data.period.to).getTime() - 1).toISOString())}` : 'Visão geral da operação'}
      />

      {noAccounts && (
        <Card className="mb-6 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <span className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Instagram className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Conecte uma conta profissional do Instagram</p>
            <p className="text-[13px] text-ink-3">Os indicadores passam a ser preenchidos com as mensagens e comentários recebidos pela conta.</p>
          </div>
          <Link href={`/w/${workspace.slug}/contas`}>
            <Button variant="secondary">
              Contas conectadas <ArrowRight className="size-4" />
            </Button>
          </Link>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Período" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              role="radio"
              aria-checked={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={clsx('h-7 rounded px-2.5 text-[13px] font-medium transition-colors', preset === p.value ? 'bg-subtle text-ink' : 'text-ink-3 hover:text-ink')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(custom);
            }}
          >
            <Input type="date" aria-label="Data inicial" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-8 w-auto" />
            <span className="text-sm text-ink-3">até</span>
            <Input type="date" aria-label="Data final" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-8 w-auto" />
            <Button size="sm" type="submit" variant="secondary" disabled={!custom.from || !custom.to}>
              Aplicar
            </Button>
          </form>
        )}
      </div>

      {error && (
        <div className="mb-6">
          <ErrorState message={error.message} onRetry={() => mutate()} />
        </div>
      )}
      {preset === 'custom' && !query && <p className="mb-6 text-sm text-ink-3">Escolha as datas inicial e final e clique em Aplicar.</p>}

      <div className={clsx('grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5', isLoading && data && 'opacity-60')}>
        {KPIS.map((k) => (
          <Card key={k.key} className="px-4 py-3.5">
            <p className="text-[13px] text-ink-2">{k.label}</p>
            {data ? (
              <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
                {k.format === 'percent' ? fmtPercent(data.metrics[k.key] as number | null) : fmtNumber(data.metrics[k.key] as number)}
              </p>
            ) : (
              <Skeleton className="mt-2 h-7 w-16" />
            )}
            <p className="mt-1 text-xs leading-snug text-ink-3">{k.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {data ? (
          <>
            <MessagesChart series={data.series} />
            <ContactsChart series={data.series} />
          </>
        ) : (
          <>
            <Skeleton className="h-[330px]" />
            <Skeleton className="h-[330px]" />
          </>
        )}
      </div>

      <div className="mt-6">
        <ActivityFeed workspaceId={workspace.id} />
      </div>
    </>
  );
}
