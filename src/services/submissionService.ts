/*
 * Certificate submission & management — mock service.
 *
 * Drafts, submission, duplicate detection, and edit-and-resubmit. Every
 * function takes the authenticated student's id and only reads or changes
 * that student's drafts and achievements. Records live in the prototype
 * store (browser only); nothing is sent to a server and no file is uploaded.
 *
 * A backend implementing the same functions replaces this module later; it
 * must re-validate input and enforce ownership server-side.
 */
import { canStudentEdit } from '../domain/status'
import type {
  Achievement,
  AchievementCategory,
  AchievementDraft,
  AchievementFormData,
  AchievementType,
  CertificateFile,
  StudentUser,
  SubmissionResult,
  ValidationError,
} from '../types'
import { describeAchievement } from './achievementService'
import { normalizeForm, STEP, validateForm, WIZARD_STEPS } from './achievementValidation'
import { PassportError, simulateFailureIfRequested } from './passportService'
import { createId, delay, getState, setState } from './store'

export class SubmissionError extends Error {
  readonly code: 'validation' | 'not_found' | 'not_editable' | 'invalid_profile'
  readonly errors: ValidationError[]
  constructor(code: SubmissionError['code'], message: string, errors: ValidationError[] = []) {
    super(message)
    this.name = 'SubmissionError'
    this.code = code
    this.errors = errors
  }
}

function requireStudent(studentId: string): StudentUser {
  const user = getState().users.find((u) => u.id === studentId)
  if (!user || user.role !== 'student') throw new SubmissionError('invalid_profile', 'Your session has expired. Please sign in again.')
  return user
}

/** The description that will be saved: the student's text if edited, otherwise generated from the form. */
export function resolveDescription(form: AchievementFormData): string {
  const typed = form.description.trim()
  return form.descriptionEdited && typed ? typed : describeAchievement(form)
}

// ── Drafts ───────────────────────────────────────────────────────────────────

type DraftCertificate = AchievementDraft['certificate']
const clampStep = (step: number) => Math.min(Math.max(0, Math.trunc(step) || 0), WIZARD_STEPS.length - 1)

export function getDrafts(studentId: string, all: AchievementDraft[] = getState().drafts): AchievementDraft[] {
  return all.filter((d) => d.studentId === studentId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

/** Null for unknown ids and for other students' drafts alike. */
export function getDraftById(studentId: string, draftId: string, all: AchievementDraft[] = getState().drafts): AchievementDraft | null {
  const draft = all.find((d) => d.id === draftId && d.studentId === studentId)
  return draft ? { ...draft, form: normalizeForm(draft.form), step: clampStep(draft.step) } : null
}

export function createDraft(studentId: string, form: AchievementFormData, step = 0, certificate?: DraftCertificate): AchievementDraft {
  requireStudent(studentId)
  const now = new Date().toISOString()
  const draft: AchievementDraft = { id: createId('drf'), studentId, step: clampStep(step), form: normalizeForm(form), certificate, createdAt: now, updatedAt: now }
  setState((s) => ({ ...s, drafts: [draft, ...s.drafts] }))
  return draft
}

export function updateDraft(studentId: string, draftId: string, form: AchievementFormData, step = 0, certificate?: DraftCertificate): AchievementDraft {
  const current = getDraftById(studentId, draftId)
  if (!current) throw new SubmissionError('not_found', 'This draft no longer exists.')
  const updated: AchievementDraft = { ...current, form: normalizeForm(form), step: clampStep(step), certificate, updatedAt: new Date().toISOString() }
  setState((s) => ({ ...s, drafts: s.drafts.map((d) => (d.id === draftId && d.studentId === studentId ? updated : d)) }))
  return updated
}

export function deleteDraft(studentId: string, draftId: string): boolean {
  if (!getDraftById(studentId, draftId)) return false
  setState((s) => ({ ...s, drafts: s.drafts.filter((d) => !(d.id === draftId && d.studentId === studentId)) }))
  return true
}

/** Short title for a draft in lists. */
export function draftTitle(draft: AchievementDraft) {
  return draft.form.eventName.trim() || 'Untitled draft'
}

// ── Duplicates ───────────────────────────────────────────────────────────────

const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * The student's existing records with the same event name (ignoring case and
 * punctuation), event date and category. A hint, not a rule: several genuine
 * achievements can come from one event.
 */
export function getPossibleDuplicates(studentId: string, form: AchievementFormData, excludeAchievementId?: string): Achievement[] {
  const name = normalizeName(form.eventName)
  if (!name || !form.eventDate || !form.category) return []
  return getState().achievements.filter(
    (a) =>
      a.studentId === studentId &&
      a.id !== excludeAchievementId &&
      a.category === form.category &&
      a.eventDate === form.eventDate &&
      normalizeName(a.eventName) === name,
  )
}

// ── Submission ───────────────────────────────────────────────────────────────

/** CP-<event year>-<sequence>: the next unused number for that year across all records. */
export function nextReference(year: string) {
  const used = getState()
    .achievements.filter((a) => a.reference.startsWith(`CP-${year}-`))
    .map((a) => Number(a.reference.split('-')[2]))
    .filter(Number.isFinite)
  return `CP-${year}-${String((used.length ? Math.max(...used) : 100) + 1).padStart(4, '0')}`
}

/** The record fields that come from the form (identity, status and history are set elsewhere). */
function fieldsFromForm(form: AchievementFormData) {
  const opt = (v: string) => v.trim() || undefined
  return {
    category: form.category as AchievementCategory,
    customCategory: form.category === 'Other' ? opt(form.customCategory) : undefined,
    eventName: form.eventName.trim().replace(/\s+/g, ' '),
    organizer: form.organizer.trim().replace(/\s+/g, ' '),
    eventDate: form.eventDate,
    location: opt(form.location),
    eventMode: form.eventMode || undefined,
    achievementType: form.achievementType as AchievementType,
    position: opt(form.position),
    details: opt(form.details),
    prizeDetails: opt(form.prizeDetails),
    evidenceNote: opt(form.evidenceNote),
    description: resolveDescription(form),
  }
}

function assertValid(form: AchievementFormData, hasCertificate: boolean) {
  const errors = validateForm(form, hasCertificate)
  if (errors.length) throw new SubmissionError('validation', errors[0].message, errors)
}

/**
 * Create a new achievement with status "submitted" and remove the draft it
 * came from, if any. The student can never choose the status.
 */
export async function submitAchievement(
  studentId: string,
  formData: AchievementFormData,
  certificate: CertificateFile | undefined,
  options: { draftId?: string } = {},
): Promise<SubmissionResult> {
  await delay(900)
  simulateFailureIfRequested()
  const student = requireStudent(studentId)
  const form = normalizeForm(formData)
  assertValid(form, !!certificate)

  const now = new Date().toISOString()
  const achievement: Achievement = {
    id: createId('ach'),
    reference: nextReference(form.eventDate.slice(0, 4)),
    studentId,
    ...fieldsFromForm(form),
    certificate: certificate!,
    status: 'submitted',
    submittedAt: now,
    updatedAt: now,
    comments: [],
    history: [{ status: 'submitted', at: now, byName: student.fullName, kind: 'submitted', actorId: student.id, actorRole: 'student' }],
  }
  setState((s) => ({
    ...s,
    achievements: [achievement, ...s.achievements],
    drafts: options.draftId ? s.drafts.filter((d) => !(d.id === options.draftId && d.studentId === studentId)) : s.drafts,
    notifications: [
      {
        id: createId('ntf'),
        userId: studentId,
        achievementId: achievement.id,
        title: 'Certificate submitted',
        body: `${achievement.eventName} (${achievement.reference}) is waiting for faculty review.`,
        createdAt: now,
        read: false,
        tone: 'info',
        type: 'submitted',
      },
      ...s.notifications,
    ],
  }))
  return { achievement, reference: achievement.reference }
}

// ── Edit & resubmit ──────────────────────────────────────────────────────────

function editableAchievement(studentId: string, achievementId: string): Achievement {
  const current = getState().achievements.find((a) => a.id === achievementId && a.studentId === studentId)
  if (!current) throw new PassportError('not_found', 'This achievement could not be found.')
  if (!canStudentEdit(current.status)) {
    throw new SubmissionError('not_editable', 'Only achievements that need attention can be edited and resubmitted.')
  }
  return current
}

/**
 * Save corrected details (and optionally a replacement certificate) on a
 * record that needs attention, without resubmitting it. Id, reference,
 * submission date, status, comments and history are all preserved.
 */
export async function updateAchievement(
  studentId: string,
  achievementId: string,
  formData: AchievementFormData,
  certificate?: CertificateFile,
): Promise<Achievement> {
  await delay(400)
  const current = editableAchievement(studentId, achievementId)
  const form = normalizeForm(formData)
  assertValid(form, true)
  const updated: Achievement = { ...current, ...fieldsFromForm(form), certificate: certificate ?? current.certificate, updatedAt: new Date().toISOString() }
  setState((s) => ({ ...s, achievements: s.achievements.map((a) => (a.id === updated.id ? updated : a)) }))
  return updated
}

/**
 * Apply corrections and send the record back to faculty. The status becomes
 * "submitted" (never a reviewer status), a "resubmitted" entry is appended to
 * the existing history, and earlier comments stay in place.
 */
export async function resubmitAchievement(
  studentId: string,
  achievementId: string,
  formData: AchievementFormData,
  options: { certificate?: CertificateFile; noteToReviewer?: string } = {},
): Promise<SubmissionResult> {
  await delay(700)
  simulateFailureIfRequested()
  const student = requireStudent(studentId)
  const current = editableAchievement(studentId, achievementId)
  const form = normalizeForm(formData)
  assertValid(form, true)

  const now = new Date().toISOString()
  const note = options.noteToReviewer?.trim().slice(0, 1000)
  const updated: Achievement = {
    ...current,
    ...fieldsFromForm(form),
    certificate: options.certificate ?? current.certificate,
    status: 'submitted',
    updatedAt: now,
    // Earlier history and comments are kept; this only appends.
    history: [
      ...current.history,
      { status: 'submitted', fromStatus: current.status, at: now, byName: student.fullName, actorId: student.id, actorRole: 'student', kind: 'resubmitted', note },
    ],
    comments: note
      ? [...current.comments, { id: createId('cmt'), authorId: student.id, authorName: student.fullName, authorRole: 'student', body: note, createdAt: now, type: 'review_update' }]
      : current.comments,
  }
  setState((s) => ({
    ...s,
    achievements: s.achievements.map((a) => (a.id === updated.id ? updated : a)),
    notifications: [
      {
        id: createId('ntf'),
        userId: studentId,
        achievementId: updated.id,
        title: 'Achievement updated',
        body: `${updated.eventName} (${updated.reference}) was resubmitted for review.`,
        createdAt: now,
        read: false,
        tone: 'info',
        type: 'resubmitted',
      },
      ...s.notifications,
    ],
  }))
  return { achievement: updated, reference: updated.reference }
}

export { STEP }
