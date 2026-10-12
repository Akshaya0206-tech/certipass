/*
 * Centralised authentication state. Components use `useAuth()` and never
 * call the auth provider directly, so the provider can be swapped later.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { authProvider, expireIfStale } from '../services/auth'
import { useStore } from '../services/store'
import type { Role, StudentRegistration, User } from '../types'
import { useToast } from './ToastContext'

interface AuthContextValue {
  currentUser: User | null
  currentRole: Role | null
  isAuthenticated: boolean
  /** True after the user chose to sign out (as opposed to expiry), until the next sign-in. */
  signedOutByUser: boolean
  login: (username: string, password: string, expectedRole: Role) => Promise<User>
  registerStudent: (data: StudentRegistration) => Promise<User>
  logout: () => void
  /** Called once the post-logout destination has rendered, so later visits to protected pages go to sign-in. */
  acknowledgeSignOut: () => void
  /** Latest user at call time — handy inside async callbacks. */
  getCurrentUser: () => User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

const EXPIRY_CHECK_MS = 30_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const session = useSyncExternalStore(authProvider.subscribe, authProvider.getSession, authProvider.getSession)
  const users = useStore((s) => s.users)
  const [signedOutByUser, setSignedOutByUser] = useState(false)

  // A session only counts if it points at an existing, active user with the same role.
  const currentUser = useMemo(() => {
    if (!session) return null
    const user = users.find((u) => u.id === session.userId)
    return user && user.role === session.role && user.active ? user : null
  }, [session, users])

  // Drop sessions that no longer resolve (account removed by a demo reset, deactivated, or tampered with).
  useEffect(() => {
    if (session && !currentUser) authProvider.logout()
  }, [session, currentUser])

  // Expire sessions on a timer and whenever the tab regains focus.
  useEffect(() => {
    if (!session) return
    const check = () => {
      if (expireIfStale()) toast.info('Session expired', 'Please sign in again to continue.')
    }
    const id = window.setInterval(check, EXPIRY_CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [session, toast])

  const latest = useRef(currentUser)
  latest.current = currentUser

  const login = useCallback(async (username: string, password: string, expectedRole: Role) => {
    const user = await authProvider.login({ username, password }, expectedRole)
    setSignedOutByUser(false)
    return user
  }, [])
  const registerStudent = useCallback(async (data: StudentRegistration) => {
    const user = await authProvider.registerStudent(data)
    setSignedOutByUser(false)
    return user
  }, [])
  const logout = useCallback(() => {
    setSignedOutByUser(true)
    authProvider.logout()
  }, [])
  const acknowledgeSignOut = useCallback(() => setSignedOutByUser(false), [])
  const getCurrentUser = useCallback(() => latest.current, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      currentRole: currentUser?.role ?? null,
      isAuthenticated: currentUser !== null,
      signedOutByUser,
      login,
      registerStudent,
      logout,
      acknowledgeSignOut,
      getCurrentUser,
    }),
    [currentUser, signedOutByUser, login, registerStudent, logout, acknowledgeSignOut, getCurrentUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
