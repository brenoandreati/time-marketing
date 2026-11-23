'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { AppShell } from '@/components/app-shell';
import { Button, ErrorState, Spinner } from '@/components/ui';
import { WorkspaceContext } from '@/components/workspace-context';
import { fetcher } from '@/lib/api';
import type { User, WorkspaceSummary } from '@/lib/types';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const me = useSWR<{ user: User }>('/auth/me', fetcher);
  const list = useSWR<{ workspaces: WorkspaceSummary[] }>('/workspaces', fetcher);

  const workspace = list.data?.workspaces.find((w) => w.slug === slug);

  useEffect(() => {
    if (workspace) {
      try {
        localStorage.setItem('cv_last_workspace', workspace.slug);
      } catch {}
    }
  }, [workspace]);

  const ctx = useMemo(() => {
    if (!workspace || !me.data || !list.data) return null;
    const perms = new Set(workspace.permissions);
    return { workspace, workspaces: list.data.workspaces, user: me.data.user, can: (p: string) => perms.has(p) };
  }, [workspace, me.data, list.data]);

  if (me.error || list.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState message={(me.error ?? list.error).message} onRetry={() => (me.mutate(), list.mutate())} />
      </div>
    );
  }
  if (!list.data || !me.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!workspace) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-ink-2">Empresa não encontrada ou você não tem acesso a ela.</p>
        <Link href="/">
          <Button variant="secondary">Voltar ao início</Button>
        </Link>
      </div>
    );
  }
  if (workspace.status === 'blocked') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium">A empresa {workspace.name} está bloqueada.</p>
        <p className="text-sm text-ink-3">Entre em contato com o suporte da plataforma.</p>
      </div>
    );
  }
  return (
    <WorkspaceContext.Provider value={ctx}>
      <AppShell>{children}</AppShell>
    </WorkspaceContext.Provider>
  );
}
