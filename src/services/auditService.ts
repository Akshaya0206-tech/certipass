/*
 * Audit trail for administrative actions (account changes, configuration
 * changes). Entries are appended when the action happens and are never
 * edited. They hold a short description only — never credentials.
 */
import type { AuditAction, AuditEvent, User } from '../types'
import { createId, setState } from './store'

export function recordAudit(actor: Pick<User, 'id' | 'fullName'>, action: AuditAction, summary: string, targetUserId?: string): AuditEvent {
  const event: AuditEvent = { id: createId('aud'), at: new Date().toISOString(), actorId: actor.id, actorName: actor.fullName, action, summary, targetUserId }
  setState((s) => ({ ...s, audit: [event, ...s.audit] }))
  return event
}
