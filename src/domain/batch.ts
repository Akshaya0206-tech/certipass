/*
 * Batches — the admission cohort a student belongs to, e.g. "2023–2027".
 *
 * A batch is derived, never stored, so no existing student or achievement
 * record has to change for faculty to group by it:
 *  - the register number carries the admission year as its first four digits
 *    (e.g. 2023CSE0417 → admitted 2023), which is the authority;
 *  - when a register number can't be read, the admission year is worked back
 *    from the student's year of study and the current academic year, which is
 *    right for every student who is progressing normally;
 *  - if neither works the student is grouped under "Unknown", so nobody is
 *    silently dropped from a list or a report.
 */
import type { StudentUser } from '../types'

/** Length of the undergraduate programme, in years. */
export const PROGRAMME_YEARS = 4

export const UNKNOWN_BATCH = 'unknown'

const EARLIEST_YEAR = 2000
const LATEST_YEAR = 2099

/** The academic year is taken to start on 1 June, as elsewhere in the app. */
const ACADEMIC_YEAR_START_MONTH = 5

/** The calendar year the current academic year began in. */
function academicYearStartYear(now: Date): number {
  return now.getMonth() >= ACADEMIC_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1
}

/** The admission year a register number begins with, if it looks like one. */
function yearFromRegisterNumber(registerNumber: string | undefined): number | null {
  const match = /^(\d{4})/.exec(registerNumber?.trim() ?? '')
  if (!match) return null
  const year = Number(match[1])
  return year >= EARLIEST_YEAR && year <= LATEST_YEAR ? year : null
}

/** The admission year implied by a year of study during the current academic year. */
function yearFromStudyYear(year: number | undefined, now: Date): number | null {
  if (!year || year < 1 || year > PROGRAMME_YEARS) return null
  return academicYearStartYear(now) - (year - 1)
}

/**
 * A student's batch code: the admission year as a string, or "unknown".
 * The code is what lists and filters compare on.
 */
export function batchCodeOf(student: Pick<StudentUser, 'registerNumber' | 'year'>, now = new Date()): string {
  const year = yearFromRegisterNumber(student.registerNumber) ?? yearFromStudyYear(student.year, now)
  return year === null ? UNKNOWN_BATCH : String(year)
}

/** "2023–2027", or "Unknown batch" when the admission year couldn't be established. */
export function batchLabel(code: string): string {
  if (code === UNKNOWN_BATCH) return 'Unknown batch'
  const start = Number(code)
  return Number.isFinite(start) ? `${start}–${start + PROGRAMME_YEARS}` : code
}

export interface Batch {
  code: string
  label: string
  /** Students in this batch, within whatever set of students it was built from. */
  students: number
}

/**
 * Every batch present among the given students, newest cohort first, with
 * "Unknown" last so it never heads the list.
 */
export function batchesOf(students: Pick<StudentUser, 'registerNumber' | 'year'>[], now = new Date()): Batch[] {
  const counts = new Map<string, number>()
  for (const s of students) {
    const code = batchCodeOf(s, now)
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([code, students]) => ({ code, label: batchLabel(code), students }))
    .sort((a, b) => {
      if (a.code === UNKNOWN_BATCH) return 1
      if (b.code === UNKNOWN_BATCH) return -1
      return b.code.localeCompare(a.code)
    })
}
