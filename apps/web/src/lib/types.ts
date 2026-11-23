export type Role = 'admin' | 'manager' | 'agent' | 'analyst' | 'viewer';

export type User = { id: string; email: string; name: string; isPlatformAdmin: boolean };

export type WorkspaceSummary = { id: string; name: string; slug: string; status: 'active' | 'blocked'; role: Role; permissions: string[] };

export type PlanLimits = {
  maxChannelAccounts: number;
  maxMembers: number;
  maxContacts: number;
  maxActiveAutomations: number;
  monthlyMessages: number;
  aiEnabled: boolean;
};

export type WorkspaceDetails = {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  createdAt: string;
  role: Role;
  roleLabel: string;
  plan: { code: string; name: string; limits: PlanLimits };
  usage: { channelAccounts: number; members: number; contacts: number; activeAutomations: number };
};

export type ChannelAccount = {
  id: string;
  channel: 'instagram';
  externalId: string;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  accountType: string | null;
  status: 'connected' | 'token_expired' | 'revoked' | 'error' | 'disconnected';
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  tokenRefreshedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastCheckedAt: string | null;
  webhookSubscribed: boolean;
  webhookFields: string[];
  connectedAt: string;
};

export type ChannelAccountsResponse = {
  accounts: ChannelAccount[];
  limit: { max: number; used: number; planName: string };
  availability: {
    instagram: { configured: boolean; missing: string[]; scopes: string[]; graphVersion: string; redirectUri: string; webhookUrl: string };
  };
};

export type DashboardMetrics = {
  totalContacts: number;
  newContacts: number;
  conversationsReceived: number;
  conversationsAutoAnswered: number;
  conversationsWaitingAgent: number;
  activeAutomations: number;
  messagesSent: number;
  messagesReceived: number;
  leadsCaptured: number;
  conversions: number;
  responseRate: number | null;
  conversionRate: number | null;
};

export type DashboardResponse = {
  period: { preset: string; from: string; to: string; timezone: string };
  metrics: DashboardMetrics;
  series: { day: string; newContacts: number; inbound: number; outbound: number }[];
};

export type ActivityItem = {
  id: string;
  type: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export type Member = { userId: string; name: string; email: string; role: Role; roleLabel: string; joinedAt: string };
