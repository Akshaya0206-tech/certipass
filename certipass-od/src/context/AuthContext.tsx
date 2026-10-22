import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAppState } from '../hooks/useData'
import * as auth from '../services/auth'
import type { PublicUser } from '../types'

interface AuthValue {
  user: PublicUser | null
  login: (identifier: string, password: string, remember: boolean) => Promise<PublicUser>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  // Bumped on sign-in / sign-out so the session is re-read.
  const [tick, setTick] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const user = useMemo(() => auth.currentUser(), [state, tick])

  const login = useCallback(async (id: string, pw: string, remember: boolean) => {
    const u = await auth.login(id, pw, remember)
    setTick((t) => t + 1)
    return u
  }, [])

  const logout = useCallback(() => {
    auth.logout()
    setTick((t) => t + 1)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** For pages that only render for a signed-in user (inside RequireRole). */
export function useUser(): PublicUser {
  const { user } = useAuth()
  if (!user) throw new Error('No signed-in user')
  return user
}
