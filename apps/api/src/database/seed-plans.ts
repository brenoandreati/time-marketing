import type { Database } from './client';
import { plans, PlanLimits } from './schema';

/**
 * Planos iniciais. Os limites são configuráveis depois pelo painel administrativo (Fase 5);
 * o seed só cria planos que ainda não existem e nunca sobrescreve limites editados.
 */
export const DEFAULT_PLANS: { code: string; name: string; isDefault: boolean; sortOrder: number; limits: PlanLimits }[] = [
  {
    code: 'free',
    name: 'Gratuito',
    isDefault: true,
    sortOrder: 0,
    limits: { maxChannelAccounts: 1, maxMembers: 2, maxContacts: 1000, maxActiveAutomations: 3, monthlyMessages: 1000, aiEnabled: false },
  },
  {
    code: 'pro',
    name: 'Profissional',
    isDefault: false,
    sortOrder: 1,
    limits: { maxChannelAccounts: 3, maxMembers: 10, maxContacts: 25000, maxActiveAutomations: 50, monthlyMessages: 50000, aiEnabled: true },
  },
  {
    code: 'enterprise',
    name: 'Empresarial',
    isDefault: false,
    sortOrder: 2,
    limits: { maxChannelAccounts: 20, maxMembers: 100, maxContacts: 500000, maxActiveAutomations: 500, monthlyMessages: 1000000, aiEnabled: true },
  },
];

export async function seedPlans(db: Database) {
  await db
    .insert(plans)
    .values(DEFAULT_PLANS)
    .onConflictDoNothing({ target: plans.code });
}
