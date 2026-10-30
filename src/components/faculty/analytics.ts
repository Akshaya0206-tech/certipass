/*
 * The numbers behind the Faculty Dashboard's Achievement Analytics: how records
 * are de-duplicated and counted, how shares are rounded, and how a chart axis is
 * scaled. Nothing here is sample data; every figure is derived from the records
 * passed in.
 */
import { RESULT_GROUP_ORDER, RESULT_GROUPS } from '../../domain/result'
import type { ResultCounts, ResultGroup } from '../../domain/result'

/** How each recorded result is drawn. The same colour is used in every chart. */
export const GROUP_STYLE: Record<ResultGroup, { fill: string; short: string }> = {
  winner: { fill: 'var(--color-navy-800)', short: 'Winners' }, // dark purple
  runner_up: { fill: 'var(--color-lavender-300)', short: 'Runners-up' }, // lavender
  participant: { fill: 'var(--color-gold)', short: 'Participants' }, // gold
  other: { fill: '#9ca3af', short: 'Other' }, // neutral grey
}

export interface GroupDatum {
  group: ResultGroup
  /** The label used on the statistics cards, e.g. "Other / Unclassified". */
  label: string
  /** A shorter label for tight axes, e.g. "Other". */
  short: string
  fill: string
  count: number
  /** Whole-number share of all records. The four shares always add up to 100. */
  percent: number
}

/** Each record once. A record that appears twice in the list is the same record, so it is not counted twice. */
export function uniqueById<T extends { achievement: { id: string } }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    if (seen.has(r.achievement.id)) return false
    seen.add(r.achievement.id)
    return true
  })
}

/**
 * Whole-number percentages that add up to exactly 100 (largest-remainder method), so the labels never read 99% or
 * 101% in total. All zeros when there is nothing to share.
 */
export function percentShares(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return values.map(() => 0)
  const exact = values.map((v) => (v / total) * 100)
  const shares = exact.map(Math.floor)
  let left = 100 - shares.reduce((sum, v) => sum + v, 0)
  const byRemainder = exact.map((e, i) => ({ i, remainder: e - shares[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    shares[i]++
    left--
  }
  return shares
}

/** The four result groups in their usual order, with counts and shares. */
export function groupData(counts: ResultCounts): GroupDatum[] {
  const percents = percentShares(RESULT_GROUP_ORDER.map((g) => counts[g]))
  return RESULT_GROUP_ORDER.map((group, i) => ({
    group,
    label: RESULT_GROUPS[group].label,
    short: GROUP_STYLE[group].short,
    fill: GROUP_STYLE[group].fill,
    count: counts[group],
    percent: percents[i],
  }))
}

/** A whole-number axis that tops out just above the biggest value, with a few evenly spaced ticks. */
export function axisScale(maxValue: number): { max: number; ticks: number[] } {
  const top = Math.max(1, Math.ceil(maxValue))
  let max: number
  let step: number
  if (top <= 4) {
    max = Math.max(2, top)
    step = 1
  } else {
    const raw = top / 4
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10
    max = step * Math.ceil(top / step)
  }
  const ticks: number[] = []
  for (let t = 0; t <= max; t += step) ticks.push(t)
  return { max, ticks }
}
