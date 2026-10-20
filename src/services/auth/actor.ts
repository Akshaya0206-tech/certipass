/*
 * Who is acting right now, according to the session — not according to
 * whatever a caller passes in. Services use this so a page (or anything else
 * running in the browser) can't simply claim to be another user or role.
 *
 * Prototype note: the session itself lives in browser storage and can be
 * edited by anyone with access to the device, so this is consistency, not
 * security. A backend must authenticate every request.
 */
import type { Role, User } from '../../types'
import { getState } from '../store'
import { getSession } from './session'

/** The signed-in, active user whose stored role matches the session, or null. */
export function currentActor(): User | null {
  const session = getSession()
  if (!session) return null
  const user = getState().users.find((u) => u.id === session.userId)
  return user && user.active && user.role === session.role ? user : null
}

export class PermissionError extends Error {
  readonly code: 'not_signed_in' | 'forbidden'
  constructor(code: PermissionError['code'], message: string) {
    super(message)
    this.name = 'PermissionError'
    this.code = code
  }
}

/** The acting user, who must be signed in with the given role. */
export function requireActor<R extends Role>(role: R): Extract<User, { role: R }> {
  const actor = currentActor()
  if (!actor) throw new PermissionError('not_signed_in', 'Your session has ended. Please sign in again.')
  if (actor.role !== role) throw new PermissionError('forbidden', `Only ${role === 'faculty' ? 'faculty' : `${role}s`} can do this.`)
  return actor as Extract<User, { role: R }>
}
