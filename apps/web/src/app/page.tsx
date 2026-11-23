'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { WorkspaceSummary } from '@/lib/types';

const LAST_KEY = 'cv_last_workspace';

/** Entrada: leva para a última empresa usada, para a primeira disponível ou para a criação da primeira empresa. */
export default function Home() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ workspaces: WorkspaceSummary[] }>('/workspaces')
      .then(({ workspaces }) => {
        if (!workspaces.length) return router.replace('/nova-empresa');
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_KEY);
        } catch {}
        const target = workspaces.find((w) => w.slug === last) ?? workspaces[0];
        router.replace(`/w/${target.slug}`);
      })
      .catch((e) => setError(e.message));
  }, [router]);

  return <main className="flex min-h-dvh items-center justify-center p-6">{error ? <ErrorState message={error} onRetry={() => location.reload()} /> : <Spinner />}</main>;
}
