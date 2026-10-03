import { supabase } from '../config/supabase';
import type { Review } from '../types';
import { chunk } from '../utils/batch';

const UPSERT_BATCH = 500;

interface ReviewRow {
  id: string;
  github_id: number;
  pull_request_id: string;
  repository_id: string;
  contributor_id: string | null;
  reviewer_login: string;
  state: string;
  submitted_at: string | null;
  created_at: string;
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    githubId: row.github_id,
    pullRequestId: row.pull_request_id,
    repositoryId: row.repository_id,
    reviewerId: row.contributor_id,
    reviewerLogin: row.reviewer_login,
    state: row.state as Review['state'],
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  };
}

export const reviewRepository = {
  async findByPullRequest(pullRequestId: string): Promise<Review[]> {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('pull_request_id', pullRequestId)
      .order('submitted_at', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data as ReviewRow[]).map(toReview);
  },

  async upsertMany(
    reviews: Omit<ReviewRow, 'id' | 'created_at'>[],
  ): Promise<void> {
    for (const batch of chunk(reviews, UPSERT_BATCH)) {
      const { error } = await supabase
        .from('reviews')
        .upsert(batch, { onConflict: 'github_id,pull_request_id' });
      if (error) throw error;
    }
  },

  async findFirstReviewTime(pullRequestId: string): Promise<string | null> {
    // Pending reviews have no submitted_at and don't count as a review yet
    const { data, error } = await supabase
      .from('reviews')
      .select('submitted_at')
      .eq('pull_request_id', pullRequestId)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as { submitted_at: string } | null)?.submitted_at ?? null;
  },
};
