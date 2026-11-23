'use client';

import { AlertTriangle, CheckCircle2, Copy, Camera as Instagram, Plus, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useWorkspace } from '@/components/workspace-context';
import { api, ApiError, fetcher } from '@/lib/api';
import { daysUntil, fmtDateTime } from '@/lib/format';
import type { ChannelAccount, ChannelAccountsResponse } from '@/lib/types';

const STATUS: Record<ChannelAccount['status'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  connected: { label: 'Conectada', tone: 'ok' },
  token_expired: { label: 'Token expirado', tone: 'bad' },
  revoked: { label: 'Autorização revogada', tone: 'bad' },
  error: { label: 'Com erro', tone: 'warn' },
  disconnected: { label: 'Desconectada', tone: 'neutral' },
};

const SCOPE_LABELS: Record<string, string> = {
  instagram_business_basic: 'Informações básicas da conta',
  instagram_business_manage_messages: 'Mensagens diretas',
  instagram_business_manage_comments: 'Comentários',
  instagram_business_content_publish: 'Publicação de conteúdo',
};

const FIELD_LABELS: Record<string, string> = {
  messages: 'mensagens',
  messaging_postbacks: 'cliques em botões',
  messaging_seen: 'leitura',
  message_reactions: 'reações',
  comments: 'comentários',
};

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}

function AccountsPage() {
  const { workspace, can } = useWorkspace();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const key = `/workspaces/${workspace.id}/channel-accounts`;
  const { data, error, isLoading, mutate } = useSWR<ChannelAccountsResponse>(key, fetcher);
  const [connecting, setConnecting] = useState(false);
  const manage = can('channels.manage');

  // Resultado do retorno do OAuth (a API redireciona para cá com ?connected= ou ?error=).
  useEffect(() => {
    const connected = params.get('connected');
    const err = params.get('error');
    if (!connected && !err) return;
    if (connected) toast('ok', 'Conta do Instagram conectada com sucesso.');
    else toast('bad', params.get('message') ?? 'Não foi possível conectar a conta.');
    router.replace(`/w/${workspace.slug}/contas`);
    mutate();
  }, [params, router, toast, workspace.slug, mutate]);

  async function connect() {
    setConnecting(true);
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>(`/workspaces/${workspace.id}/channel-accounts/instagram/connect`, { method: 'POST' });
      window.location.href = authorizeUrl;
    } catch (e) {
      toast('bad', e instanceof ApiError ? e.message : 'Não foi possível iniciar a conexão.');
      setConnecting(false);
    }
  }

  const ig = data?.availability.instagram;
  const atLimit = data ? data.limit.used >= data.limit.max : false;

  return (
    <>
      <PageHeader
        title="Contas conectadas"
        description="Perfis profissionais do Instagram conectados pela API oficial da Meta."
        action={
          manage && (
            <Button onClick={connect} loading={connecting} disabled={!ig?.configured || atLimit}>
              <Plus className="size-4" /> Conectar Instagram
            </Button>
          )
        }
      />

      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {isLoading && <Skeleton className="h-40" />}

      {data && ig && !ig.configured && <NotConfigured missing={ig.missing} redirectUri={ig.redirectUri} webhookUrl={ig.webhookUrl} />}

      {data && (
        <>
          <p className="mb-3 text-[13px] text-ink-3">
            {data.limit.used} de {data.limit.max} {data.limit.max === 1 ? 'conta permitida' : 'contas permitidas'} no plano {data.limit.planName}.
            {atLimit && manage && ' Desconecte uma conta para conectar outra.'}
          </p>
          {data.accounts.length === 0 ? (
            <Card className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-ink-3">
                <Instagram className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium">Nenhuma conta conectada</p>
              <p className="mt-1 max-w-sm text-[13px] text-ink-3">
                Conecte um perfil profissional (comercial ou de criador de conteúdo). Você será levado ao Instagram para autorizar o acesso.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.accounts.map((a) => (
                <AccountCard key={a.id} account={a} canManage={manage} onChanged={() => mutate()} onReconnect={connect} reconnectAvailable={!!ig?.configured} />
              ))}
            </div>
          )}
          <Requirements scopes={ig?.scopes ?? []} />
        </>
      )}
    </>
  );
}

function AccountCard({ account: a, canManage, onChanged, onReconnect, reconnectAvailable }: { account: ChannelAccount; canManage: boolean; onChanged: () => void; onReconnect: () => void; reconnectAvailable: boolean }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState<'check' | 'refresh' | 'disconnect' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const status = STATUS[a.status];
  const days = daysUntil(a.tokenExpiresAt);
  const needsReconnect = a.status === 'revoked' || a.status === 'token_expired';
  const base = `/workspaces/${workspace.id}/channel-accounts/${a.id}`;

  async function run(kind: 'check' | 'refresh') {
    setBusy(kind);
    try {
      const { account } = await api<{ account: ChannelAccount }>(`${base}/${kind === 'check' ? 'check' : 'refresh-token'}`, { method: 'POST' });
      if (account.status === 'connected') toast('ok', kind === 'check' ? 'Conexão verificada: tudo certo.' : 'Token renovado.');
      else toast('bad', account.lastError ?? 'A conta apresenta um problema.');
      onChanged();
    } catch (e) {
      toast('bad', e instanceof ApiError ? e.message : 'Falha na operação.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await api(base, { method: 'DELETE' });
      toast('ok', `@${a.username ?? a.externalId} desconectada.`);
      setConfirm(false);
      onChanged();
    } catch (e) {
      toast('bad', e instanceof ApiError ? e.message : 'Não foi possível desconectar.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {a.profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.profilePictureUrl} alt="" className="size-10 shrink-0 rounded-full border border-line object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-3">
              <Instagram className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">@{a.username ?? a.externalId}</p>
              <Badge tone={status.tone} icon={status.tone === 'ok' ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}>
                {status.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {a.name ?? 'Instagram'}
              {a.accountType && ` · ${a.accountType === 'BUSINESS' ? 'Comercial' : a.accountType === 'MEDIA_CREATOR' ? 'Criador de conteúdo' : a.accountType}`}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {needsReconnect ? (
              <Button size="sm" onClick={onReconnect} disabled={!reconnectAvailable}>
                Reconectar
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => run('check')} loading={busy === 'check'} disabled={!!busy}>
                  <ShieldCheck className="size-3.5" /> Verificar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => run('refresh')} loading={busy === 'refresh'} disabled={!!busy}>
                  <RefreshCw className="size-3.5" /> Renovar token
                </Button>
              </>
            )}
            <Button size="sm" variant="danger" onClick={() => setConfirm(true)} disabled={!!busy}>
              <Unplug className="size-3.5" /> Desconectar
            </Button>
          </div>
        )}
      </div>

      {a.lastError && (
        <div className="mx-5 mb-4 flex gap-2 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {a.lastError} {a.lastErrorAt && <span className="opacity-75">({fmtDateTime(a.lastErrorAt)})</span>}
          </span>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line px-5 py-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Token de acesso">
          {days == null ? '—' : days < 0 ? 'Vencido' : `Vence em ${days} dia${days === 1 ? '' : 's'}`}
          <span className="block text-xs text-ink-3">Renovação automática antes do vencimento</span>
        </Detail>
        <Detail label="Webhooks">
          {a.webhookSubscribed ? (a.webhookFields.map((f) => FIELD_LABELS[f] ?? f).join(', ') || 'Assinados') : 'Não assinados'}
        </Detail>
        <Detail label="Permissões concedidas">{a.grantedScopes.map((s) => SCOPE_LABELS[s] ?? s).join(', ') || '—'}</Detail>
        <Detail label="Última verificação">{fmtDateTime(a.lastCheckedAt)}</Detail>
      </dl>

      <ConfirmDialog open={confirm} title={`Desconectar @${a.username ?? a.externalId}?`} confirmLabel="Desconectar" danger loading={busy === 'disconnect'} onConfirm={disconnect} onClose={() => setConfirm(false)}>
        A plataforma deixa de receber mensagens e comentários desta conta e o token de acesso é apagado. Contatos e conversas já registrados continuam disponíveis. Você pode conectar de novo a qualquer momento.
      </ConfirmDialog>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const toast = useToast();
  return (
    <span className="mt-1 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-subtle px-2 py-1 font-mono text-xs text-ink">{value}</code>
      <button
        aria-label="Copiar"
        className="rounded p-1 text-ink-3 hover:bg-subtle hover:text-ink"
        onClick={() => navigator.clipboard.writeText(value).then(() => toast('ok', 'Copiado.'), () => toast('bad', 'Não foi possível copiar.'))}
      >
        <Copy className="size-3.5" />
      </button>
    </span>
  );
}

function NotConfigured({ missing, redirectUri, webhookUrl }: { missing: string[]; redirectUri: string; webhookUrl: string }) {
  return (
    <Card className="mb-6 border-warn/30">
      <div className="flex gap-3 p-5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Integração com a Meta não configurada</p>
          <p className="mt-1 text-ink-2">
            Para conectar contas, o administrador da plataforma precisa criar um app na Meta for Developers com o produto <strong>Instagram API com Login do Instagram</strong> e definir as variáveis abaixo no servidor. Enquanto isso, nenhuma conexão é
            simulada.
          </p>
          <p className="mt-3 text-xs text-ink-3">Variáveis ausentes</p>
          <p className="mt-1 font-mono text-xs">{missing.join(' · ')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-ink-3">URL de redirecionamento OAuth</p>
              <CopyValue value={redirectUri} />
            </div>
            <div>
              <p className="text-xs text-ink-3">URL de callback dos webhooks</p>
              <CopyValue value={webhookUrl} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Requirements({ scopes }: { scopes: string[] }) {
  return (
    <div className="mt-8 grid gap-4 text-[13px] text-ink-2 md:grid-cols-2">
      <div>
        <p className="mb-1.5 font-medium text-ink">Permissões solicitadas</p>
        <ul className="space-y-1">
          {scopes.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="font-mono text-xs text-ink-3">{s}</span>
              <span>— {SCOPE_LABELS[s] ?? s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-medium text-ink">Requisitos da Meta</p>
        <p>
          A conta precisa ser profissional (comercial ou criador de conteúdo) e permitir acesso a mensagens nas configurações do Instagram. Para atender contas de terceiros, o app precisa de <strong>Advanced Access</strong> nessas permissões, concedido
          após o App Review. Até lá, apenas contas com função no app (administradores, desenvolvedores e testadores) podem ser conectadas.
        </p>
      </div>
    </div>
  );
}
