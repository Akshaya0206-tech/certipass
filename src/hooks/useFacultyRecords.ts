/*
 * React bindings for the faculty record service. Everything is scoped to the
 * signed-in member of faculty's departments; drafts are never part of it.
 */
import { useMemo } from 'react'
import { batchesOf } from '../domain/batch'
import {
  facultyScope,
  getFacultyAchievements,
  getFacultyRecordSummary,
  getFacultyStudentRows,
  getFacultyStudents,
} from '../services/facultyService'
import { useStore } from '../services/store'
import type { FacultyUser } from '../types'
import { useRequiredUser } from './useData'

export function useFaculty(): FacultyUser {
  const user = useRequiredUser()
  if (user.role !== 'faculty') throw new Error('Expected a faculty session')
  return user
}

/** Records in scope, archived ones included (re-renders when they change). */
export function useFacultyAchievements() {
  const faculty = useFaculty()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyAchievements(faculty.id, achievements, users), [faculty.id, achievements, users])
}

/** Record counts by recorded result, over the active records in scope. */
export function useFacultySummary() {
  const faculty = useFaculty()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyRecordSummary(faculty.id, achievements, users), [faculty.id, achievements, users])
}

export function useFacultyStudents() {
  const faculty = useFaculty()
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyStudents(faculty.id, users), [faculty.id, users])
}

/** Students in scope with their record counts. */
export function useFacultyStudentRows() {
  const faculty = useFaculty()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  return useMemo(() => getFacultyStudentRows(faculty.id, achievements, users), [faculty.id, achievements, users])
}

/** The departments this member of faculty covers. */
export function useFacultyScope() {
  const faculty = useFaculty()
  return useMemo(() => facultyScope(faculty), [faculty])
}

/** The admission-year batches present among the students in scope, newest first. */
export function useFacultyBatches() {
  const students = useFacultyStudents()
  return useMemo(() => batchesOf(students), [students])
}
