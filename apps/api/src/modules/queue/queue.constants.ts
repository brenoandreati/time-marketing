export const QUEUE_WEBHOOK_EVENTS = 'webhook-events';
export const QUEUE_MAINTENANCE = 'maintenance';

export const JOB_PROCESS_WEBHOOK_EVENT = 'process-webhook-event';
export const JOB_REFRESH_TOKENS = 'refresh-channel-tokens';
export const JOB_REQUEUE_STALE_EVENTS = 'requeue-stale-webhook-events';

export type ProcessWebhookEventJob = { eventId: string };
