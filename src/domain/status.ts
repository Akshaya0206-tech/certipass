/*
 * The single source of truth for a record's state: what each one means and
 * how it is labelled. Shared by the student, faculty and admin workspaces.
 *
 * Lifecycle:  draft → submitted → (archived)
 *
 * There is no approval step. A submitted record is immediately part of the
 * register and visible to the faculty who cover the student's department;
 * faculty read and report on records, they do not gate them.
 *
 * Drafts are deliberately NOT a status. An unfinished submission is a separate
 * AchievementDraft record (services/submissionService.ts) that only its
 * student can see, so it can never be mistaken for a submitted certificate.
 *
 * Archiving is an administrator's housekeeping action (services/adminService.ts).
 * It never removes a record and is not a judgement on the achievement.
 */
import type { RecordStatus } from '../types'

export interface RecordStatusDefinition {
  label: string
  /** What the status means, written for students. */
  description: string
  /** Counted in the active register, reports and batch lists. */
  active: boolean
}

export const RECORD_STATUS_DEFINITIONS: Record<RecordStatus, RecordStatusDefinition> = {
  submitted: {
    label: 'Submitted',
    description: 'Recorded in your passport and available to your department’s faculty.',
    active: true,
  },
  archived: {
    label: 'Archived',
    description: 'Retired from active lists by the Office of Academic Records. The record and its details are kept.',
    active: false,
  },
}

/** Display order, following the lifecycle. */
export const RECORD_STATUS_ORDER: RecordStatus[] = ['submitted', 'archived']

export const recordStatusLabel = (s: RecordStatus) => RECORD_STATUS_DEFINITIONS[s].label
export const isActiveRecord = (s: RecordStatus) => RECORD_STATUS_DEFINITIONS[s].active

/** Only the owning student may edit a record, and only while it is active. */
export const canStudentEdit = (s: RecordStatus) => isActiveRecord(s)

/** Active records only — what every count, batch list and report is built from. */
export const activeRecords = <T extends { status: RecordStatus }>(list: T[]): T[] => list.filter((a) => isActiveRecord(a.status))

/** Maximum length of a note recorded with an edit or an archive action. */
export const MAX_NOTE_LENGTH = 1000
