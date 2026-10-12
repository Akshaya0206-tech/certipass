/*
 * React bindings for the faculty review service. Everything is scoped to the
 * signed-in reviewer's departments; drafts are never part of it.
 */
import { useMemo } from 'react'
import { getFacultyAchievements, getFacultyReviewSummary, getFacultyStudents, reviewScope } from '../services/reviewService'
import { useStore } from '../services/store'
import type { FacultyUser } from '../types'
import { useRequiredUser } from './useData'

export function useFaculty(): FacultyUser {
  const user = useRequiredUser()
  if (user.role !== 'faculty') throw new Error('Expected a faculty session')
  return user
}

/** Records in the reviewer's scope (re-renders when they change). */
export function useFacultyAchievements() {
  const faculty = useFaculty()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyAchievements(faculty.id, achievements, users), [faculty.id, achievements, users])
}

export function useFacultySummary() {
  const faculty = useFaculty()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyReviewSummary(faculty.id, achievements, users), [faculty.id, achievements, users])
}

export function useFacultyStudents() {
  const faculty = useFaculty()
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyStudents(faculty.id, users), [faculty.id, users])
}

export function useReviewScope() {
  const faculty = useFaculty()
  return useMemo(() => reviewScope(faculty), [faculty])
}
