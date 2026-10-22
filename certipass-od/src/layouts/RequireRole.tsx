import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'
import { HOME } from './navigation'

/**
 * Route guard for the UI. It only decides what to render — the services
 * re-check the signed-in account on every read and write.
 */
export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />
  return <Outlet />
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user) return <Navigate to={HOME[user.role]} replace />
  return <>{children}</>
}
