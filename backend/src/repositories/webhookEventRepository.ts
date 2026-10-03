import { supabase } from '../config/supabase';
import type { WebhookEvent } from '../types';

interface WebhookEventRow {
  id: string;
  repository_id: string | null;
  event_type: string;
  action: string | null;
  github_delivery_id: string;
  payload: Record<string, unknown>;
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
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

export const webhookEventRepository = {
  async create(event: Omit<WebhookEventRow, 'id' | 'created_at'>): Promise<WebhookEvent> {
    const { data, error } = await supabase
      .from('webhook_events')
      .insert(event)
      .select()
      .single();
    if (error) throw error;
    return toWebhookEvent(data as WebhookEventRow);
  },

  async markProcessed(id: string): Promise<void> {
    const { error } = await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
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
