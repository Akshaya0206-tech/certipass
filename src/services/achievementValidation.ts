/*
 * Validation rules for the submission wizard. Pure functions over the form
 * data, used both for inline feedback in the UI and as the authoritative
 * check inside the submission service, so the two can never drift apart.
 */
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_TYPES, EVENT_MODES } from '../types'
import type { Achievement, AchievementFormData, ValidationError } from '../types'

export const WIZARD_STEPS = ['Category', 'Event details', 'Achievement', 'Additional info', 'Certificate', 'Review'] as const
export const STEP = { category: 0, event: 1, result: 2, additional: 3, certificate: 4, review: 5 } as const
/** Steps a student may skip entirely. */
export const OPTIONAL_STEPS: number[] = [STEP.additional]

export const LIMITS = { eventName: 120, organizer: 120, location: 80, customCategory: 40, position: 80, description: 400, notes: 600 } as const
const EARLIEST_EVENT_DATE = '2015-01-01'

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the student's clock). */
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** True only for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31 and free text). */
export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function emptyForm(): AchievementFormData {
  return {
    category: '',
    customCategory: '',
    eventName: '',
    organizer: '',
    eventDate: '',
    location: '',
    eventMode: '',
    achievementType: '',
    position: '',
    description: '',
    descriptionEdited: false,
    details: '',
    prizeDetails: '',
    evidenceNote: '',
  }
}

/** Prefill the wizard from an existing record (used for edit-and-resubmit). */
export function formFromAchievement(a: Achievement): AchievementFormData {
  return {
    category: a.category,
    customCategory: a.customCategory ?? '',
    eventName: a.eventName,
    organizer: a.organizer,
    eventDate: a.eventDate,
    location: a.location ?? '',
    eventMode: a.eventMode ?? '',
    achievementType: a.achievementType,
    position: a.position ?? '',
    description: a.description,
    descriptionEdited: true,
    details: a.details ?? '',
    prizeDetails: a.prizeDetails ?? '',
    evidenceNote: a.evidenceNote ?? '',
  }
}

/** Repair a form loaded from storage: unknown keys dropped, missing ones defaulted. */
export function normalizeForm(raw: Partial<AchievementFormData> | null | undefined): AchievementFormData {
  const base = emptyForm()
  if (!raw || typeof raw !== 'object') return base
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    category: (ACHIEVEMENT_CATEGORIES as readonly string[]).includes(str(raw.category)) ? (raw.category as AchievementFormData['category']) : '',
    customCategory: str(raw.customCategory),
    eventName: str(raw.eventName),
    organizer: str(raw.organizer),
    eventDate: str(raw.eventDate),
    location: str(raw.location),
    eventMode: (EVENT_MODES as readonly string[]).includes(str(raw.eventMode)) ? (raw.eventMode as AchievementFormData['eventMode']) : '',
    achievementType: (ACHIEVEMENT_TYPES as readonly string[]).includes(str(raw.achievementType)) ? (raw.achievementType as AchievementFormData['achievementType']) : '',
    position: str(raw.position),
    description: str(raw.description),
    descriptionEdited: raw.descriptionEdited === true,
    details: str(raw.details),
    prizeDetails: str(raw.prizeDetails),
    evidenceNote: str(raw.evidenceNote),
  }
}

/**
 * Errors for one wizard step. `hasCertificate` says whether a valid file is
 * selected (or, when resubmitting, the existing certificate is being kept).
 */
export function validateStep(step: number, f: AchievementFormData, hasCertificate: boolean): ValidationError[] {
  const errors: ValidationError[] = []
  const add = (field: ValidationError['field'], message: string) => errors.push({ field, step, message })
  const tooLong = (value: string, max: number) => value.trim().length > max

  if (step === STEP.category) {
    if (!f.category) add('category', 'Choose the category that best fits this achievement.')
    if (f.category === 'Other' && tooLong(f.customCategory, LIMITS.customCategory)) add('customCategory', `Keep the label to ${LIMITS.customCategory} characters or fewer.`)
  }

  if (step === STEP.event) {
    if (!f.eventName.trim()) add('eventName', 'Enter the event name as it appears on the certificate.')
    else if (tooLong(f.eventName, LIMITS.eventName)) add('eventName', `Event name must be ${LIMITS.eventName} characters or fewer.`)
    if (!f.organizer.trim()) add('organizer', 'Enter who organised the event.')
    else if (tooLong(f.organizer, LIMITS.organizer)) add('organizer', `Organiser must be ${LIMITS.organizer} characters or fewer.`)
    if (!f.eventDate) add('eventDate', 'Enter the date of the event.')
    else if (!isValidIsoDate(f.eventDate)) add('eventDate', 'Enter a valid date.')
    else if (f.eventDate > todayIso()) add('eventDate', 'The event date can’t be in the future — add achievements after the event has taken place.')
    else if (f.eventDate < EARLIEST_EVENT_DATE) add('eventDate', 'Please check the year.')
    if (tooLong(f.location, LIMITS.location)) add('location', `Location must be ${LIMITS.location} characters or fewer.`)
  }

  if (step === STEP.result) {
    if (!f.achievementType) add('achievementType', 'Select what you achieved.')
    if (f.achievementType === 'Other' && !f.position.trim()) add('position', 'Describe the result, since you chose “Other”.')
    if (tooLong(f.position, LIMITS.position)) add('position', `Keep this to ${LIMITS.position} characters or fewer.`)
    if (tooLong(f.description, LIMITS.description)) add('description', `Description must be ${LIMITS.description} characters or fewer.`)
  }

  if (step === STEP.additional) {
    for (const field of ['details', 'prizeDetails', 'evidenceNote'] as const) {
      if (tooLong(f[field], LIMITS.notes)) add(field, `Keep this to ${LIMITS.notes} characters or fewer.`)
    }
  }

  if (step === STEP.certificate && !hasCertificate) add('certificate', 'Attach the certificate file to continue.')
  return errors
}

/** Every error across all data steps (used before final submission). */
export function validateForm(f: AchievementFormData, hasCertificate: boolean): ValidationError[] {
  return [STEP.category, STEP.event, STEP.result, STEP.additional, STEP.certificate].flatMap((s) => validateStep(s, f, hasCertificate))
}

export type StepState = 'complete' | 'incomplete' | 'optional-empty'

/** Whether each data step is filled in, for the progress summary. */
export function stepStates(f: AchievementFormData, hasCertificate: boolean): StepState[] {
  return [STEP.category, STEP.event, STEP.result, STEP.additional, STEP.certificate].map((s) => {
    if (validateStep(s, f, hasCertificate).length) return 'incomplete'
    if (s === STEP.additional && !f.details.trim() && !f.prizeDetails.trim() && !f.evidenceNote.trim()) return 'optional-empty'
    return 'complete'
  })
}

/** Display label for a record's or form's category, including a custom "Other" label. */
export function categoryLabel(x: { category: string; customCategory?: string }) {
  return x.category === 'Other' && x.customCategory?.trim() ? x.customCategory.trim() : x.category
}
