import { supabase } from '../config/supabase.js';
import type { WebhookEvent, WebhookEventStatus } from '../types/index.js';

interface WebhookEventRow {
  id: string;
  repository_id: string | null;
  event_type: string;
  action: string | null;
  github_delivery_id: string;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
}

function toWebhookEvent(row: WebhookEventRow): WebhookEvent {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    eventType: row.event_type,
    action: row.action,
    githubDeliveryId: row.github_delivery_id,
    payload: row.payload,
    status: row.status,
    processingError: row.processing_error,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

export type WebhookEventInsert = Pick<
  WebhookEventRow,
  'repository_id' | 'event_type' | 'action' | 'github_delivery_id' | 'payload'
>;

export const webhookEventRepository = {
  async create(event: WebhookEventInsert): Promise<WebhookEvent> {
    const { data, error } = await supabase
      .from('webhook_events')
      .insert(event)
      .select()
      .single();
    if (error) throw error;
    return toWebhookEvent(data as WebhookEventRow);
  },

  async markProcessed(id: string): Promise<void> {
    await this.setOutcome(id, 'processed', null);
  },

  async markIgnored(id: string, reason: string): Promise<void> {
    await this.setOutcome(id, 'ignored', reason);
  },

  async markFailed(id: string, message: string): Promise<void> {
    await this.setOutcome(id, 'failed', message.slice(0, 1000));
  },

  async setOutcome(id: string, status: WebhookEventStatus, processingError: string | null): Promise<void> {
    const { error } = await supabase
      .from('webhook_events')
      .update({ status, processing_error: processingError, processed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async existsByDeliveryId(deliveryId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('github_delivery_id', deliveryId);
    if (error) throw error;
    return (count ?? 0) > 0;
  },
};
