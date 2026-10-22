/**
 * The OD application "backend": every read and write goes through these
 * functions, and each one checks the signed-in account itself. The UI hides
 * actions a role cannot use, but this layer is what actually refuses them.
 */
import { dayCount } from '../lib/format'
import type { AuditAction, EventType, Notification, OdApplication, OdDocument, PublicUser } from '../types'
import { ApiError, delay, requireUser } from './auth'
import { getState, mutate } from './store'
import { deleteFile } from './fileStore'

export interface ApplicationInput {
  eventName: string
  eventType: EventType | ''
  organizer: string
  venue: string
  eventStart: string
  eventEnd: string
  odFrom: string
  odUntil: string
  reason: string
  link: string
  documents: OdDocument[]
  declaration: boolean
}

export type FieldErrors = Partial<Record<keyof ApplicationInput, string>>

export const emptyInput = (): ApplicationInput => ({
  eventName: '',
  eventType: '',
  organizer: '',
  venue: '',
  eventStart: '',
  eventEnd: '',
  odFrom: '',
  odUntil: '',
  reason: '',
  link: '',
  documents: [],
  declaration: false,
})

export const MAX_OD_DAYS = 15

/** Shared by the form (inline messages) and by the service (final check). */
export function validateApplication(i: ApplicationInput, mode: 'draft' | 'submit'): FieldErrors {
  const e: FieldErrors = {}
  if (!i.eventName.trim()) e.eventName = 'Enter the event name.'
  else if (i.eventName.trim().length < 4) e.eventName = 'Event name is too short.'
  if (mode === 'draft') return e

  if (!i.eventType) e.eventType = 'Choose an event type.'
  if (!i.organizer.trim()) e.organizer = 'Enter the organising institution or organisation.'
  if (!i.venue.trim()) e.venue = 'Enter the event venue.'
  if (!i.eventStart) e.eventStart = 'Choose the event start date.'
  if (!i.eventEnd) e.eventEnd = 'Choose the event end date.'
  else if (i.eventStart && i.eventEnd < i.eventStart) e.eventEnd = 'The end date cannot be before the start date.'
  if (!i.odFrom) e.odFrom = 'Choose the first day you need OD.'
  if (!i.odUntil) e.odUntil = 'Choose the last day you need OD.'
  else if (i.odFrom && i.odUntil < i.odFrom) e.odUntil = 'OD end date cannot be before the OD start date.'

  if (!e.odFrom && !e.odUntil && !e.eventStart && !e.eventEnd) {
    if (i.odFrom > i.eventStart) e.odFrom = 'OD must start on or before the event start date.'
    else if (i.odUntil < i.eventEnd) e.odUntil = 'OD must run until at least the event end date.'
    else if (dayCount(i.odFrom, i.odUntil) > MAX_OD_DAYS) e.odUntil = `OD cannot exceed ${MAX_OD_DAYS} days in one application.`
  }
  if (i.reason.trim().length < 20) e.reason = 'Give a reason of at least 20 characters so the reviewer can decide.'
  else if (i.reason.length > 600) e.reason = 'Keep the reason under 600 characters.'
  if (i.link.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.link.trim())) e.link = 'Enter a full link starting with http:// or https://.'
  if (i.documents.length === 0) e.documents = 'Attach at least one supporting document.'
  if (!i.declaration) e.declaration = 'Please confirm the information is accurate.'
  return e
}

/* ------------------------------ access rules ------------------------------ */

export function canReview(actor: PublicUser): boolean {
  if (actor.role === 'admin') return true
  return actor.role === 'faculty' && !!actor.permissions?.canReview
}

export function canView(actor: PublicUser, app: OdApplication): boolean {
  if (actor.role === 'student') return app.studentId === actor.id
  if (app.status === 'draft') return false // drafts are private to the student
  if (actor.role === 'admin') return true
  return actor.permissions?.scope === 'all' || app.department === actor.department
}

function inReviewScope(actor: PublicUser, app: OdApplication): boolean {
  return canReview(actor) && canView(actor, app)
}

/* --------------------------------- queries -------------------------------- */

const byRecent = (a: OdApplication, b: OdApplication) =>
  (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt)

export function listApplications(): OdApplication[] {
  const actor = requireUser()
  return getState().applications.filter((a) => canView(actor, a)).sort(byRecent)
}

export function getApplication(id: string): OdApplication | null {
  const actor = requireUser()
  const app = getState().applications.find((a) => a.id === id)
  return app && canView(actor, app) ? app : null
}

/** An approved application is the only thing a printable pass can come from. */
export function getPassSource(id: string): OdApplication | null {
  const app = getApplication(id)
  return app && app.status === 'approved' && app.passNumber && app.decision ? app : null
}

export function listNotifications(): Notification[] {
  const actor = requireUser()
  return getState().notifications.filter((n) => n.userId === actor.id).sort((a, b) => b.at.localeCompare(a.at))
}

export function markNotificationsRead(): void {
  const actor = requireUser()
  mutate((s) => {
    s.notifications.forEach((n) => {
      if (n.userId === actor.id) n.read = true
    })
  })
}

/* -------------------------------- mutations ------------------------------- */

function audit(actor: PublicUser, action: AuditAction, note?: string): OdApplication['audit'][number] {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    note,
  }
}

function requireStudent(): PublicUser {
  const actor = requireUser()
  if (actor.role !== 'student') throw new ApiError('forbidden', 'Only students can create OD applications.')
  return actor
}

function findOwnEditable(actor: PublicUser, id: string) {
  const app = getState().applications.find((a) => a.id === id)
  if (!app || app.studentId !== actor.id) throw new ApiError('not_found', 'Application not found.')
  if (app.status !== 'draft') throw new ApiError('conflict', 'Only drafts can be edited. This application has already been submitted.')
  return app
}

function apply(app: OdApplication, input: ApplicationInput) {
  Object.assign(app, {
    eventName: input.eventName.trim(),
    eventType: input.eventType,
    organizer: input.organizer.trim(),
    venue: input.venue.trim(),
    eventStart: input.eventStart,
    eventEnd: input.eventEnd,
    odFrom: input.odFrom,
    odUntil: input.odUntil,
    reason: input.reason.trim(),
    link: input.link.trim(),
    documents: input.documents,
    declaration: input.declaration,
  })
}

export async function saveDraft(input: ApplicationInput, id?: string): Promise<OdApplication> {
  await delay(250)
  const actor = requireStudent()
  const errors = validateApplication(input, 'draft')
  if (Object.keys(errors).length) throw new ApiError('invalid', errors.eventName ?? 'Check the form.')
  return mutate((s) => {
    const now = new Date().toISOString()
    if (id) {
      const app = s.applications.find((a) => a.id === id)
      if (!app || app.studentId !== actor.id) throw new ApiError('not_found', 'Application not found.')
      if (app.status !== 'draft') throw new ApiError('conflict', 'Only drafts can be edited.')
      apply(app, input)
      app.audit.push(audit(actor, 'draft_saved'))
      return app
    }
    const me = s.users.find((u) => u.id === actor.id)!
    s.counters.application += 1
    const app: OdApplication = {
      id: `DRAFT-${String(s.counters.application).padStart(4, '0')}`,
      studentId: me.id,
      studentName: me.name,
      registerNo: me.registerNo ?? '',
      department: me.department,
      year: me.year ?? '',
      section: me.section ?? '',
      collegeEmail: me.email,
      eventName: '', eventType: '', organizer: '', venue: '', eventStart: '', eventEnd: '',
      odFrom: '', odUntil: '', reason: '', link: '', documents: [], declaration: false,
      status: 'draft',
      createdAt: now,
      audit: [],
    }
    apply(app, input)
    app.audit.push(audit(actor, 'draft_saved'))
    s.applications.push(app)
    return app
  })
}

export async function submitApplication(input: ApplicationInput, id?: string): Promise<OdApplication> {
  await delay(600)
  const actor = requireStudent()
  const errors = validateApplication(input, 'submit')
  if (Object.keys(errors).length) throw new ApiError('invalid', 'Some fields need attention before you can submit.')

  const overlap = getState().applications.find(
    (a) =>
      a.studentId === actor.id &&
      a.id !== id &&
      (a.status === 'pending' || a.status === 'approved') &&
      a.odFrom <= input.odUntil &&
      a.odUntil >= input.odFrom,
  )
  if (overlap) {
    throw new ApiError('conflict', `You already have application ${overlap.id} (${overlap.status}) covering some of these OD dates.`)
  }

  return mutate((s) => {
    const me = s.users.find((u) => u.id === actor.id)!
    let app: OdApplication | undefined
    if (id) {
      app = s.applications.find((a) => a.id === id)
      if (!app || app.studentId !== actor.id) throw new ApiError('not_found', 'Application not found.')
      if (app.status !== 'draft') throw new ApiError('conflict', 'This application has already been submitted.')
    } else {
      app = {
        id: '', studentId: me.id, studentName: '', registerNo: '', department: '', year: '', section: '', collegeEmail: '',
        eventName: '', eventType: '', organizer: '', venue: '', eventStart: '', eventEnd: '', odFrom: '', odUntil: '',
        reason: '', link: '', documents: [], declaration: false, status: 'draft', createdAt: new Date().toISOString(), audit: [],
      }
      s.applications.push(app)
    }
    s.counters.application += 1
    const now = new Date().toISOString()
    // Identity fields always come from the verified profile, never from the form.
    app.id = `OD-${new Date().getFullYear()}-${String(s.counters.application).padStart(4, '0')}`
    app.studentName = me.name
    app.registerNo = me.registerNo ?? ''
    app.department = me.department
    app.year = me.year ?? ''
    app.section = me.section ?? ''
    app.collegeEmail = me.email
    apply(app, input)
    app.status = 'pending'
    app.submittedAt = now
    app.audit.push(audit(actor, 'submitted'))

    s.users
      .filter((u) => u.role === 'faculty' && u.active && u.permissions?.canReview && (u.permissions.scope === 'all' || u.department === app!.department))
      .forEach((u) =>
        s.notifications.push({
          id: `n-${Date.now().toString(36)}-${u.id}`,
          userId: u.id,
          at: now,
          title: 'New OD application',
          body: `${app!.studentName} submitted ${app!.id} for ${app!.eventName}.`,
          link: `/faculty/applications/${app!.id}`,
          read: false,
        }),
      )
    return app
  })
}

export async function deleteDraft(id: string): Promise<void> {
  await delay(200)
  const actor = requireStudent()
  const docs = findOwnEditable(actor, id).documents
  mutate((s) => {
    s.applications = s.applications.filter((a) => a.id !== id)
  })
  await Promise.all(docs.map((d) => deleteFile(d.id)))
}

export async function decide(id: string, outcome: 'approved' | 'rejected', remarks: string): Promise<OdApplication> {
  await delay(500)
  const actor = requireUser()
  if (!canReview(actor)) throw new ApiError('forbidden', 'You do not have permission to review applications.')
  const trimmed = remarks.trim()
  if (outcome === 'rejected' && trimmed.length < 10) {
    throw new ApiError('invalid', 'Give a reason of at least 10 characters when rejecting an application.')
  }
  return mutate((s) => {
    const app = s.applications.find((a) => a.id === id)
    if (!app || !inReviewScope(actor, app)) throw new ApiError('forbidden', 'You cannot review this application.')
    if (app.status !== 'pending') throw new ApiError('conflict', `This application is already ${app.status}; the decision is final.`)
    const now = new Date().toISOString()
    app.status = outcome
    app.decision = { byId: actor.id, byName: actor.name, byRole: actor.role, at: now, remarks: trimmed || undefined }
    if (outcome === 'approved') {
      s.counters.pass += 1
      app.passNumber = `REC-OD-${new Date().getFullYear()}-${String(s.counters.pass).padStart(5, '0')}`
    }
    app.audit.push(audit(actor, outcome, trimmed || undefined))
    s.notifications.push({
      id: `n-${Date.now().toString(36)}-${app.studentId}`,
      userId: app.studentId,
      at: now,
      title: outcome === 'approved' ? 'OD application approved' : 'OD application rejected',
      body: `${app.id} · ${app.eventName}`,
      link: outcome === 'approved' ? `/student/passes/${app.id}` : `/student/applications/${app.id}`,
      read: false,
    })
    return app
  })
}
