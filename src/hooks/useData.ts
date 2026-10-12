import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../services/store'
import type { PublicUser, StudentUser } from '../types'

export function useCurrentUser(): PublicUser | null {
  return useAuth().currentUser
}

/** For pages rendered inside a role guard, where the user is guaranteed. */
export function useRequiredUser(): PublicUser {
  const user = useCurrentUser()
  if (!user) throw new Error('useRequiredUser called outside an authenticated route')
  return user
}

export function useStudent(): StudentUser {
  const user = useRequiredUser()
  if (user.role !== 'student') throw new Error('Expected a student session')
  return user
}

export const useAchievements = () => useStore((s) => s.achievements)
export const useUsers = () => useStore((s) => s.users)
export const useNotifications = () => useStore((s) => s.notifications)


export function useUserMap() {
  const users = useUsers()
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
}
