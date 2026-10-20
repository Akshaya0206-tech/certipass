/*
 * Achievement results — what the student actually won, as recorded on the
 * record. This is the only axis faculty lists and reports group by.
 *
 * A result is NOT a workflow state: "Winner" means the student won the event,
 * never that something was approved. Record state lives in domain/status.ts
 * and the two are kept apart on purpose.
 */
import { ACHIEVEMENT_TYPES } from '../types'
import type { Achievement, AchievementType } from '../types'

export type ResultGroup = 'winner' | 'runner_up' | 'participant' | 'other'

/** Which group each recorded result falls into. Every AchievementType is listed. */
export const RESULT_GROUP_OF: Record<AchievementType, ResultGroup> = {
  Winner: 'winner',
  'Runner-up': 'runner_up',
  Participant: 'participant',
  Finalist: 'other',
  'Best Paper': 'other',
  'Best Project': 'other',
  Other: 'other',
}

export interface ResultGroupDefinition {
  /** Plural label for a list or a tab, e.g. "Winners". */
  label: string
  /** Singular label for one record. */
  singular: string
  /** What the group covers, for a caption. */
  description: string
}

export const RESULT_GROUPS: Record<ResultGroup, ResultGroupDefinition> = {
  winner: { label: 'Winners', singular: 'Winner', description: 'Records whose recorded result is Winner.' },
  runner_up: { label: 'Runners-up', singular: 'Runner-up', description: 'Records whose recorded result is Runner-up.' },
  participant: { label: 'Participants', singular: 'Participant', description: 'Records whose recorded result is Participant.' },
  other: {
    label: 'Other / Unclassified',
    singular: 'Other',
    description: 'Finalist, Best Paper, Best Project and any result the student recorded as Other.',
  },
}

/** Tab order for the batch achievement lists. */
export const RESULT_GROUP_ORDER: ResultGroup[] = ['winner', 'runner_up', 'participant', 'other']

/** The group a record belongs to, from its recorded result. */
export function resultGroupOf(a: Pick<Achievement, 'achievementType'>): ResultGroup {
  return RESULT_GROUP_OF[a.achievementType] ?? 'other'
}

/** The results that make up a group, for a filter dropdown. */
export function typesInGroup(group: ResultGroup): AchievementType[] {
  return ACHIEVEMENT_TYPES.filter((t) => RESULT_GROUP_OF[t] === group)
}

/** What to show as the result: the student's own wording when they gave one. */
export function resultLabel(a: Pick<Achievement, 'achievementType' | 'position'>): string {
  const position = a.position?.trim()
  return position ? `${a.achievementType} · ${position}` : a.achievementType
}

export interface ResultCounts {
  total: number
  winner: number
  runner_up: number
  participant: number
  other: number
}

/** Counts by result group. Each record counts once, so the four add up to the total. */
export function countByResult(list: Pick<Achievement, 'achievementType'>[]): ResultCounts {
  const counts: ResultCounts = { total: list.length, winner: 0, runner_up: 0, participant: 0, other: 0 }
  for (const a of list) counts[resultGroupOf(a)]++
  return counts
}
