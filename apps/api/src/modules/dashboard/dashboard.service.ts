import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { automations, contacts, conversations, messages, workspaces } from '../../database/schema';

export type Period = { from: Date; to: Date };

/**
 * Indicadores do painel. Tudo é calculado a partir dos dados reais da empresa;
 * quando o denominador é zero a taxa volta como null (a interface mostra "—").
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async timezone(workspaceId: string) {
    const [w] = await this.db.select({ tz: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, workspaceId));
    return w?.tz ?? 'America/Sao_Paulo';
  }

  async metrics(workspaceId: string, { from, to }: Period) {
    const ws = workspaceId;
    const inPeriod = (col: any) => and(gte(col, from), lt(col, to));

    const [
      [totalContacts],
      [newContacts],
      [leads],
      [conversions],
      [activeAutomations],
      [waitingAgent],
      [sent],
      [received],
      conv,
    ] = await Promise.all([
      this.db.select({ n: count() }).from(contacts).where(eq(contacts.workspaceId, ws)),
      this.db.select({ n: count() }).from(contacts).where(and(eq(contacts.workspaceId, ws), inPeriod(contacts.firstSeenAt))),
      this.db.select({ n: count() }).from(contacts).where(and(eq(contacts.workspaceId, ws), inPeriod(contacts.leadCapturedAt))),
      this.db.select({ n: count() }).from(contacts).where(and(eq(contacts.workspaceId, ws), inPeriod(contacts.convertedAt))),
      this.db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, ws), eq(automations.status, 'active'))),
      this.db.select({ n: count() }).from(conversations).where(and(eq(conversations.workspaceId, ws), eq(conversations.status, 'waiting_agent'))),
      this.db.select({ n: count() }).from(messages).where(and(eq(messages.workspaceId, ws), eq(messages.direction, 'outbound'), inPeriod(messages.sentAt))),
      this.db.select({ n: count() }).from(messages).where(and(eq(messages.workspaceId, ws), eq(messages.direction, 'inbound'), inPeriod(messages.sentAt))),
      // Conversas com mensagem recebida no período, e quantas delas tiveram resposta (automática ou humana) no período.
      this.db.execute<{ received: string; answered: string; auto_answered: string }>(sql`
        with inbound as (
          select distinct conversation_id from ${messages}
          where workspace_id = ${ws} and direction = 'inbound' and sent_at >= ${from.toISOString()} and sent_at < ${to.toISOString()}
        )
        select
          (select count(*) from inbound) as received,
          (select count(*) from inbound i where exists (
            select 1 from ${messages} o where o.conversation_id = i.conversation_id and o.direction = 'outbound'
              and o.sent_at >= ${from.toISOString()} and o.sent_at < ${to.toISOString()})) as answered,
          (select count(*) from inbound i where exists (
            select 1 from ${messages} o where o.conversation_id = i.conversation_id and o.direction = 'outbound' and o.sender in ('automation', 'ai')
              and o.sent_at >= ${from.toISOString()} and o.sent_at < ${to.toISOString()})) as auto_answered
      `),
    ]);

    const c = conv.rows[0];
    const conversationsReceived = Number(c?.received ?? 0);
    const answered = Number(c?.answered ?? 0);
    const autoAnswered = Number(c?.auto_answered ?? 0);

    return {
      totalContacts: totalContacts.n,
      newContacts: newContacts.n,
      conversationsReceived,
      conversationsAutoAnswered: autoAnswered,
      conversationsWaitingAgent: waitingAgent.n,
      activeAutomations: activeAutomations.n,
      messagesSent: sent.n,
      messagesReceived: received.n,
      leadsCaptured: leads.n,
      conversions: conversions.n,
      responseRate: conversationsReceived ? answered / conversationsReceived : null,
      conversionRate: newContacts.n ? conversions.n / newContacts.n : null,
    };
  }

  /** Série diária (no fuso da empresa) para os gráficos de evolução. */
  async timeseries(workspaceId: string, { from, to }: Period, tz: string) {
    const res = await this.db.execute<{ day: string; new_contacts: string; inbound: string; outbound: string }>(sql`
      with days as (
        select generate_series(
          date_trunc('day', ${from.toISOString()}::timestamptz at time zone ${tz}),
          date_trunc('day', (${to.toISOString()}::timestamptz - interval '1 second') at time zone ${tz}),
          interval '1 day'
        )::date as day
      ),
      c as (
        select (first_seen_at at time zone ${tz})::date as day, count(*) as n from ${contacts}
        where workspace_id = ${workspaceId} and first_seen_at >= ${from.toISOString()} and first_seen_at < ${to.toISOString()} group by 1
      ),
      m as (
        select (sent_at at time zone ${tz})::date as day,
          count(*) filter (where direction = 'inbound') as inbound,
          count(*) filter (where direction = 'outbound') as outbound
        from ${messages}
        where workspace_id = ${workspaceId} and sent_at >= ${from.toISOString()} and sent_at < ${to.toISOString()} group by 1
      )
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0) as new_contacts, coalesce(m.inbound, 0) as inbound, coalesce(m.outbound, 0) as outbound
      from days d left join c on c.day = d.day left join m on m.day = d.day order by d.day
    `);
    return res.rows.map((r) => ({ day: r.day, newContacts: Number(r.new_contacts), inbound: Number(r.inbound), outbound: Number(r.outbound) }));
  }
}
