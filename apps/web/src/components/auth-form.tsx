'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Field, Input } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setFormError(null);
    try {
      const body = mode === 'signup' ? values : { email: values.email, password: values.password };
      await api(`/auth/${mode}`, { method: 'POST', json: body });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) setErrors(err.fieldErrors);
        else setFormError(err.message);
        if (err.fieldErrors && !Object.keys(err.fieldErrors).some((k) => k in values)) setFormError(err.message);
      } else setFormError('Algo deu errado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">{mode === 'login' ? 'Entrar' : 'Criar sua conta'}</h1>
      <p className="mt-1 text-sm text-ink-3">{mode === 'login' ? 'Acesse o painel da sua empresa.' : 'Comece a automatizar o atendimento do seu Instagram.'}</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {mode === 'signup' && (
          <Field label="Nome" htmlFor="name" error={errors.name}>
            <Input id="name" autoComplete="name" value={values.name} onChange={set('name')} invalid={!!errors.name} required />
          </Field>
        )}
        <Field label="E-mail" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} invalid={!!errors.email} required />
        </Field>
        <Field label="Senha" htmlFor="password" error={errors.password} hint={mode === 'signup' ? 'Mínimo de 8 caracteres, com letras e números.' : undefined}>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={values.password}
            onChange={set('password')}
            invalid={!!errors.password}
            required
          />
        </Field>
        {formError && <p className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">{formError}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-3">
        {mode === 'login' ? (
          <>
            Ainda não tem conta?{' '}
            <Link href="/criar-conta" className="font-medium text-accent hover:underline">
              Criar conta
            </Link>
          </>
        ) : (
          <>
            Já tem conta?{' '}
            <Link href="/entrar" className="font-medium text-accent hover:underline">
              Entrar
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
