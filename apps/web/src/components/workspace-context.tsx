'use client';

import { createContext, useContext } from 'react';
import type { User, WorkspaceSummary } from '@/lib/types';

export type WorkspaceCtx = { workspace: WorkspaceSummary; workspaces: WorkspaceSummary[]; user: User; can: (permission: string) => boolean };

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace fora do layout da empresa');
  return ctx;
}
