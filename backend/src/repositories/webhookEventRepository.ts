import { supabase } from '../config/supabase.js';
import type { WebhookEvent, WebhookEventStatus, WebhookEventSummary } from '../types/index.js';

const UNIQUE_VIOLATION = '23505';

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
  /**
   * Records a delivery. Returns null when this delivery id was already recorded
   * (GitHub redelivery): the unique constraint makes the check race-free.
   */
  async create(event: WebhookEventInsert): Promise<WebhookEvent | null> {
    const { data, error } = await supabase
      .from('webhook_events')
      .insert(event)
      .select()
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return null;
      throw error;
    }
    return toWebhookEvent(data as WebhookEventRow);
  },

  /** Latest deliveries for a repository, newest first. Never includes payloads. */
  async findRecentForRepository(repositoryId: string, limit: number): Promise<WebhookEventSummary[]> {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id, event_type, action, status, processing_error, created_at, processed_at')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Omit<WebhookEventRow, 'repository_id' | 'github_delivery_id' | 'payload'>[]).map((r) => ({
      id: r.id,
      eventType: r.event_type,
      action: r.action,
      status: r.status,
      processingError: r.processing_error,
      createdAt: r.created_at,
      processedAt: r.processed_at,
    }));
  },

  async markProcessing(id: string): Promise<void> {
    const { error } = await supabase.from('webhook_events').update({ status: 'processing' }).eq('id', id);
    if (error) throw error;
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
};
