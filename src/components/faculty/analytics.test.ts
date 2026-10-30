import { describe, expect, it } from 'vitest'
import { axisScale, groupData, percentShares, uniqueById } from './analytics'

describe('percentShares', () => {
  it('adds up to exactly 100 by giving the leftover points to the largest remainders', () => {
    // 23.8, 9.5, 47.6, 19.0 → rounding each would give 24 + 10 + 48 + 19 = 101
    expect(percentShares([5, 2, 10, 4])).toEqual([24, 9, 48, 19])
    expect(percentShares([1, 1, 1])).toEqual([34, 33, 33])
  })

  it.each([
    [[7], [100]],
    [[0, 0, 3, 0], [0, 0, 100, 0]],
    [[0, 0, 0, 0], [0, 0, 0, 0]],
    [[], []],
  ])('handles %j', (values, expected) => {
    expect(percentShares(values)).toEqual(expected)
  })

  it('always totals 100 when there is anything to share', () => {
    for (let a = 0; a <= 12; a++)
      for (let b = 0; b <= 12; b++)
        for (let c = 0; c <= 12; c++) {
          const shares = percentShares([a, b, c, 7])
          expect(shares.reduce((s, v) => s + v, 0)).toBe(100)
          expect(shares.every((v, i) => (i === 3 ? v > 0 : true) && Number.isInteger(v))).toBe(true)
        }
  })
})

describe('axisScale', () => {
  it.each([
    [0, 2, [0, 1, 2]],
    [1, 2, [0, 1, 2]],
    [3, 3, [0, 1, 2, 3]],
    [4, 4, [0, 1, 2, 3, 4]],
    [5, 6, [0, 2, 4, 6]],
    [10, 10, [0, 5, 10]],
    [21, 30, [0, 10, 20, 30]],
  ])('for a biggest value of %i tops out at %i', (value, max, ticks) => {
    expect(axisScale(value)).toEqual({ max, ticks })
  })

  it('always leaves room above the biggest value, with whole-number ticks that start at 0 and end at the top', () => {
    for (let v = 0; v <= 1000; v++) {
      const { max, ticks } = axisScale(v)
      expect(max).toBeGreaterThanOrEqual(v)
      expect(ticks[0]).toBe(0)
      expect(ticks.at(-1)).toBe(max)
      expect(ticks.every((t) => Number.isInteger(t))).toBe(true)
      expect(ticks.length).toBeLessThanOrEqual(7)
    }
  })
})

describe('uniqueById', () => {
  it('keeps the first of any records that share an id', () => {
    const rows = [{ achievement: { id: 'a' }, n: 1 }, { achievement: { id: 'b' }, n: 2 }, { achievement: { id: 'a' }, n: 3 }]
    expect(uniqueById(rows).map((r) => r.n)).toEqual([1, 2])
  })
})

describe('groupData', () => {
  it('lists the four groups in order with their counts, and the counts and shares add up', () => {
    const data = groupData({ total: 21, winner: 5, runner_up: 2, participant: 10, other: 4 })
    expect(data.map((d) => [d.group, d.label, d.count, d.percent])).toEqual([
      ['winner', 'Winners', 5, 24],
      ['runner_up', 'Runners-up', 2, 9],
      ['participant', 'Participants', 10, 48],
      ['other', 'Other / Unclassified', 4, 19],
    ])
    expect(data.reduce((s, d) => s + d.count, 0)).toBe(21)
    expect(data.reduce((s, d) => s + d.percent, 0)).toBe(100)
  })

  it('uses a different colour for each group: dark purple, lavender, gold and grey', () => {
    const fills = groupData({ total: 0, winner: 0, runner_up: 0, participant: 0, other: 0 }).map((d) => d.fill)
    expect(new Set(fills).size).toBe(4)
    expect(fills).toEqual(['var(--color-navy-800)', 'var(--color-lavender-300)', 'var(--color-gold)', '#9ca3af'])
  })
})
