'use client';

import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { useWorkspace } from '@/components/workspace-context';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmtDate, fmtNumber } from '@/lib/format';
import { TIMEZONES } from '@/lib/timezones';
import type { Member, WorkspaceDetails, WorkspaceSummary } from '@/lib/types';
import { useSWRConfig } from 'swr';

export default function SettingsPage() {
  const { workspace, can } = useWorkspace();
  const { data, error, mutate } = useSWR<{ workspace: WorkspaceDetails }>(`/workspaces/${workspace.id}`, fetcher);
  const members = useSWR<{ members: Member[] }>(can('members.read') ? `/workspaces/${workspace.id}/members` : null, fetcher);

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, plano e equipe." />
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!data && !error && <Skeleton className="h-60" />}
      {data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <GeneralCard details={data.workspace} editable={can('workspace.manage')} onSaved={() => mutate()} />
            {can('members.read') && (
              <Card>
                <CardHeader title="Equipe" description="Pessoas com acesso a esta empresa e suas funções." />
                {members.error && (
                  <div className="p-5">
                    <ErrorState message={members.error.message} onRetry={() => members.mutate()} />
                  </div>
                )}
                {!members.data && !members.error && <Skeleton className="m-5 h-16" />}
                <ul>
                  {members.data?.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                      <span className="flex size-8 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-ink-2">{m.name.slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        <p className="truncate text-xs text-ink-3">{m.email}</p>
                      </div>
                      <Badge>{m.roleLabel}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <PlanCard details={data.workspace} />
        </div>
      )}
    </>
  );
}

function GeneralCard({ details, editable, onSaved }: { details: WorkspaceDetails; editable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(details.name);
  const [timezone, setTimezone] = useState(details.timezone);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setName(details.name);
    setTimezone(details.timezone);
  }, [details.name, details.timezone]);
  const dirty = name.trim() !== details.name || timezone !== details.timezone;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      await api(`/workspaces/${details.id}`, { method: 'PATCH', json: { name: name.trim(), timezone } });
      toast('ok', 'Alterações salvas.');
      onSaved();
      mutate<{ workspaces: WorkspaceSummary[] }>('/workspaces');
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      toast('bad', err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Empresa" description={`Criada em ${fmtDate(details.createdAt)} · Sua função: ${details.roleLabel}`} />
      <form onSubmit={save} className="space-y-4 p-5">
        <Field label="Nome" htmlFor="ws-name" error={fieldErrors.name}>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} minLength={2} maxLength={80} invalid={!!fieldErrors.name} />
        </Field>
        <Field label="Fuso horário" htmlFor="ws-tz" error={fieldErrors.timezone} hint="Define os dias nos relatórios do painel.">
          <Select id="ws-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!editable}>
            {!TIMEZONES.some((t) => t.value === timezone) && <option value={timezone}>{timezone}</option>}
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Endereço" htmlFor="ws-slug" hint="Identificador usado na URL do painel.">
          <Input id="ws-slug" value={details.slug} disabled readOnly />
        </Field>
        {editable ? (
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!dirty || name.trim().length < 2}>
              Salvar alterações
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">Somente administradores podem alterar estes dados.</p>
        )}
      </form>
    </Card>
  );
}

function PlanCard({ details }: { details: WorkspaceDetails }) {
  const { limits } = details.plan;
  const rows = [
    { label: 'Contas conectadas', used: details.usage.channelAccounts, max: limits.maxChannelAccounts },
    { label: 'Membros da equipe', used: details.usage.members, max: limits.maxMembers },
    { label: 'Contatos', used: details.usage.contacts, max: limits.maxContacts },
    { label: 'Automações ativas', used: details.usage.activeAutomations, max: limits.maxActiveAutomations },
  ];
  return (
    <Card className="h-fit">
      <CardHeader title={`Plano ${details.plan.name}`} description="Limites de uso desta empresa" />
      <div className="space-y-4 p-5">
        {rows.map((r) => {
          const pct = Math.min(100, (r.used / Math.max(1, r.max)) * 100);
          return (
            <div key={r.label}>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-2">{r.label}</span>
                <span className="tabular-nums text-ink">
                  {fmtNumber(r.used)} / {fmtNumber(r.max)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={r.used} aria-valuemax={r.max} aria-label={r.label}>
                <div className={pct >= 100 ? 'h-full rounded-full bg-bad' : pct >= 80 ? 'h-full rounded-full bg-warn' : 'h-full rounded-full bg-accent'} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        <div className="flex justify-between border-t border-line pt-3 text-[13px]">
          <span className="text-ink-2">Mensagens por mês</span>
          <span className="tabular-nums">{fmtNumber(limits.monthlyMessages)}</span>
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-ink-2">Recursos de IA</span>
          <span>{limits.aiEnabled ? 'Incluídos' : 'Não incluídos'}</span>
        </div>
      </div>
    </Card>
  );
}
