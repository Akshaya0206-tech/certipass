/*
 * The single source of truth for achievement statuses: what each one means,
 * how it is labelled, and how statuses are grouped for counting. Shared by the
 * student, faculty and admin workspaces.
 *
 * Lifecycle:  submitted → under_review → verified
 *                              ↘ needs_attention → (student edits & resubmits) → submitted
 *             verified → under_review (reopen: faculty only, reason required)
 *
 * REVIEW_ACTIONS below is the complete list of moves a reviewer can make.
 * Anything not listed there is not allowed.
 *
 * Drafts are deliberately NOT a status. An unfinished submission is a separate
 * AchievementDraft record (services/submissionService.ts) that only its
 * student can see, so it can never be mistaken for a submitted certificate.
 */
import type { SubmissionStatus } from '../types'

export interface StatusDefinition {
  label: string
  /** What the status means, written for students. */
  description: string
  /** Waiting on faculty (counts as "in review"). */
  awaitingReview: boolean
  /** Waiting on the student. */
  awaitingStudent: boolean
}

export const STATUS_DEFINITIONS: Record<SubmissionStatus, StatusDefinition> = {
  submitted: {
    label: 'Submitted',
    description: 'Submitted and waiting for a faculty reviewer to pick it up.',
    awaitingReview: true,
    awaitingStudent: false,
  },
  under_review: {
    label: 'Under review',
    description: 'A faculty reviewer is checking this submission.',
    awaitingReview: true,
    awaitingStudent: false,
  },
  needs_attention: {
    label: 'Needs attention',
    description: 'The reviewer has asked for a clarification or correction. Edit and resubmit it.',
    awaitingReview: false,
    awaitingStudent: true,
  },
  verified: {
    label: 'Verified',
    description: 'Faculty has completed verification. It is part of your verified record.',
    awaitingReview: false,
    awaitingStudent: false,
  },
}

/** Display order, following the lifecycle. */
export const STATUS_ORDER: SubmissionStatus[] = ['submitted', 'under_review', 'needs_attention', 'verified']

export const statusLabel = (s: SubmissionStatus) => STATUS_DEFINITIONS[s].label
export const isAwaitingReview = (s: SubmissionStatus) => STATUS_DEFINITIONS[s].awaitingReview
export const needsStudentAction = (s: SubmissionStatus) => STATUS_DEFINITIONS[s].awaitingStudent
/** Only a student can resubmit, and only when the reviewer asked for changes. */
export const canStudentEdit = (s: SubmissionStatus) => s === 'needs_attention'

/**
 * Summary buckets. Every record falls into exactly one bucket, so
 * total = verified + inReview + needsAttention.
 */
export type StatusBucket = 'verified' | 'inReview' | 'needsAttention'
export function bucketOf(s: SubmissionStatus): StatusBucket {
  if (s === 'verified') return 'verified'
  if (s === 'needs_attention') return 'needsAttention'
  return 'inReview'
}

// ── Faculty review actions ───────────────────────────────────────────────────

export type ReviewAction = 'start_review' | 'request_correction' | 'verify' | 'reopen'

export interface ReviewActionRule {
  label: string
  /** The only statuses this action may be taken from. */
  from: SubmissionStatus[]
  to: SubmissionStatus
  /** The reviewer must explain the action; it is recorded and shown to the student. */
  requiresReason: boolean
}

/** Every status change a reviewer can make. There are no other transitions. */
export const REVIEW_ACTIONS: Record<ReviewAction, ReviewActionRule> = {
  start_review: { label: 'Start review', from: ['submitted'], to: 'under_review', requiresReason: false },
  request_correction: { label: 'Request correction', from: ['under_review'], to: 'needs_attention', requiresReason: true },
  verify: { label: 'Verify achievement', from: ['under_review'], to: 'verified', requiresReason: false },
  reopen: { label: 'Reopen review', from: ['verified'], to: 'under_review', requiresReason: true },
}

export const canReview = (action: ReviewAction, status: SubmissionStatus) => REVIEW_ACTIONS[action].from.includes(status)

export function allowedReviewActions(status: SubmissionStatus): ReviewAction[] {
  return (Object.keys(REVIEW_ACTIONS) as ReviewAction[]).filter((a) => canReview(a, status))
}

/** Minimum length for a reason, so "ok" or "fix" can't stand in for an explanation. */
export const MIN_REASON_LENGTH = 10
