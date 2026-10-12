import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePathFor, loginPathFor } from '../services/auth'
import type { Role } from '../types'

/** Router state passed when a guard turns someone away from another role's area. */
export interface AccessDeniedState {
  deniedPath: string
}

/**
 * Client-side route guard. It controls navigation in the prototype only —
 * it is NOT authorisation. Data access must be enforced by the backend.
 *
 *  - Just signed out    → the sign-in screen at "/".
 *  - No session        → that area's sign-in page (remembering where they were going).
 *  - Wrong role        → their own dashboard, with a notice explaining why.
 */
export function RequireRole({ role }: { role: Role }) {
  const { currentUser, signedOutByUser } = useAuth()
  const location = useLocation()
  // Deliberate sign-out ends on the entry sign-in screen, whatever role was signed in.
  if (!currentUser && signedOutByUser) return <Navigate to="/" replace />
  if (!currentUser) {
    return <Navigate to={loginPathFor(role)} replace state={{ from: location.pathname + location.search }} />
  }
  if (currentUser.role !== role) {
    const state: AccessDeniedState = { deniedPath: location.pathname }
    return <Navigate to={homePathFor(currentUser.role)} replace state={state} />
  }
  return <Outlet />
}

/** Sign-in and registration pages: signed-in users go straight to their own dashboard. */
export function GuestOnly({ children }: { children: React.ReactElement }) {
  const { currentUser } = useAuth()
  return currentUser ? <Navigate to={homePathFor(currentUser.role)} replace /> : children
}
