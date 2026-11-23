export type WorkspaceRole = 'admin' | 'manager' | 'agent' | 'analyst' | 'viewer';

export const PERMISSIONS = [
  'dashboard.read',
  'workspace.manage',
  'members.read',
  'members.manage',
  'channels.read',
  'channels.manage',
  'automations.read',
  'automations.manage',
  'contacts.read',
  'contacts.manage',
  'conversations.read',
  'conversations.reply',
  'reports.read',
  'integrations.manage',
  'settings.manage',
  'activity.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

/** Matriz de acesso por função. Ponto único de verdade, usado pelo backend e exposto ao frontend. */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  admin: ALL,
  manager: new Set(PERMISSIONS.filter((p) => p !== 'workspace.manage' && p !== 'members.manage')),
  agent: new Set<Permission>(['dashboard.read', 'channels.read', 'contacts.read', 'contacts.manage', 'conversations.read', 'conversations.reply']),
  analyst: new Set<Permission>(['dashboard.read', 'channels.read', 'automations.read', 'contacts.read', 'conversations.read', 'reports.read', 'activity.read']),
  viewer: new Set<Permission>(['dashboard.read', 'channels.read', 'automations.read', 'contacts.read', 'conversations.read', 'reports.read']),
};

export function can(role: WorkspaceRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  agent: 'Atendente',
  analyst: 'Analista',
  viewer: 'Visualizador',
};
