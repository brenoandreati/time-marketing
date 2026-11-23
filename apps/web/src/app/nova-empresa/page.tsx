'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Logo } from '@/components/logo';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { WorkspaceSummary } from '@/lib/types';
import { TIMEZONES } from '@/lib/timezones';

export default function NewWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { workspace } = await api<{ workspace: WorkspaceSummary }>('/workspaces', { method: 'POST', json: { name, timezone } });
      router.replace(`/w/${workspace.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors?.name ?? err.message) : 'Não foi possível criar a empresa.');
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-[420px] p-6">
        <h1 className="text-lg font-semibold tracking-tight">Crie sua empresa</h1>
        <p className="mt-1 text-sm text-ink-3">Cada empresa tem contas, contatos, automações e equipe separados. Você poderá criar outras depois.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Nome da empresa" htmlFor="ws-name" error={error ?? undefined}>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Loja Aurora" invalid={!!error} required minLength={2} maxLength={80} autoFocus />
          </Field>
          <Field label="Fuso horário" htmlFor="ws-tz" hint="Usado nos relatórios e nos horários das automações.">
            <Select id="ws-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full" loading={loading} disabled={name.trim().length < 2}>
            Criar empresa
          </Button>
        </form>
      </Card>
    </main>
  );
}
