'use client';

import clsx from 'clsx';
import { AlertTriangle, CircleAlert, Dot } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import type { ActivityItem } from '@/lib/types';
import { Card, CardHeader, ErrorState, Skeleton } from './ui';

export function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  const { data, error, mutate, isLoading } = useSWR<{ items: ActivityItem[] }>(`/workspaces/${workspaceId}/activity`, fetcher, { refreshInterval: 30_000 });
  return (
    <Card className="flex flex-col">
      <CardHeader title="Atividades recentes" description="Contatos, conversas, conexões e erros de processamento" />
      <div className="flex-1 px-5 py-2">
        {error && (
          <div className="py-3">
            <ErrorState message={error.message} onRetry={() => mutate()} />
          </div>
        )}
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-2.5">
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        {data && !data.items.length && <p className="py-6 text-center text-sm text-ink-3">Nenhuma atividade ainda.</p>}
        <ul>
          {data?.items.map((item) => (
            <li key={item.id} className="flex gap-2 border-b border-line py-2.5 last:border-0">
              <span className="mt-0.5 shrink-0">
                {item.level === 'error' ? (
                  <CircleAlert className="size-4 text-bad" aria-label="Erro" />
                ) : item.level === 'warning' ? (
                  <AlertTriangle className="size-4 text-warn" aria-label="Atenção" />
                ) : (
                  <Dot className="size-4 text-ink-3" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={clsx('text-sm', item.level === 'error' ? 'text-bad' : 'text-ink')}>{item.message}</p>
                <p className="mt-0.5 text-xs text-ink-3" title={fmtDateTime(item.createdAt)}>
                  {fmtRelative(item.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
