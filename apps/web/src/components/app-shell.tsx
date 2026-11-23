'use client';

import clsx from 'clsx';
import { Building2, Check, ChevronsUpDown, LayoutDashboard, LogOut, Menu, Plus, Settings, Unplug, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Logo } from './logo';
import { useWorkspace } from './workspace-context';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:pl-60">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Logo />
        <button aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-ink-2 hover:bg-subtle">
          <Menu className="size-5" />
        </button>
      </header>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line bg-surface transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <button aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle lg:hidden">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-3">
          <WorkspaceSwitcher />
        </div>
        <Nav />
        <UserFooter />
      </aside>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

function Nav() {
  const { workspace, can } = useWorkspace();
  const pathname = usePathname();
  const base = `/w/${workspace.slug}`;
  const items = [
    { href: base, label: 'Painel', icon: LayoutDashboard, show: can('dashboard.read'), exact: true },
    { href: `${base}/contas`, label: 'Contas conectadas', icon: Unplug, show: can('channels.read') },
    { href: `${base}/configuracoes`, label: 'Configurações', icon: Settings, show: true },
  ];
  return (
    <nav className="mt-4 flex-1 space-y-0.5 px-3" aria-label="Principal">
      {items
        .filter((i) => i.show)
        .map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                active ? 'bg-subtle font-medium text-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink',
              )}
            >
              <i.icon className={clsx('size-4', active ? 'text-accent' : 'text-ink-3')} aria-hidden />
              {i.label}
            </Link>
          );
        })}
    </nav>
  );
}

function WorkspaceSwitcher() {
  const { workspace, workspaces } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-2 text-left hover:bg-subtle"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-accent-soft text-xs font-semibold text-accent">{workspace.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{workspace.name}</span>
        <ChevronsUpDown className="size-3.5 text-ink-3" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-line bg-surface p-1 shadow-lg shadow-black/5">
          <p className="px-2 py-1.5 text-xs font-medium text-ink-3">Empresas</p>
          {workspaces.map((w) => (
            <Link key={w.id} role="menuitem" href={`/w/${w.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-subtle">
              <Building2 className="size-3.5 text-ink-3" />
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="size-3.5 text-accent" />}
            </Link>
          ))}
          <div className="my-1 border-t border-line" />
          <Link role="menuitem" href="/nova-empresa" className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-2 hover:bg-subtle">
            <Plus className="size-3.5" />
            Nova empresa
          </Link>
        </div>
      )}
    </div>
  );
}

function UserFooter() {
  const { user } = useWorkspace();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/entrar');
    }
  }
  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-ink-3">{user.email}</p>
      </div>
      <button onClick={logout} disabled={loading} aria-label="Sair" title="Sair" className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink disabled:opacity-50">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
