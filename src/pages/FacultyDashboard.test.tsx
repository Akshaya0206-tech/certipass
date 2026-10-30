import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getState, resetDemoData, setState } from '../services/store'
import FacultyDashboard from './FacultyDashboard'

// Dr. Meera Subramanian covers CSE and AIDS. In the seed data those departments hold 21 active records:
// 5 winners, 2 runners-up, 10 participants and 4 finalist / best paper / other.
vi.mock('../hooks/useData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useData')>()),
  useRequiredUser: () => getState().users.find((u) => u.id === 'fac-01')!,
}))

beforeEach(() => resetDemoData())
afterEach(() => cleanup())

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <FacultyDashboard />
    </MemoryRouter>,
  )

const cards = () => screen.getByRole('region', { name: 'Achievement records in your departments' })
const analytics = () => screen.getByRole('region', { name: 'Achievement Analytics' })
const chart = (name: RegExp) => within(analytics()).getByRole('figure', { name })

interface Figures {
  total: number
  winner: number
  runner_up: number
  participant: number
  other: number
}

/** The numbers on the statistics cards. */
function cardFigures(): Figures {
  const read = (label: string) => Number(within(cards()).getByText(label).closest('div')!.querySelector('dd')!.textContent)
  return { total: read('Total Records'), winner: read('Winners'), runner_up: read('Runners-up'), participant: read('Participants'), other: read('Other / Unclassified') }
}

/** The doughnut's legend: count and percentage for each group. */
function legend() {
  return within(chart(/Achievement Distribution/))
    .getAllByRole('listitem')
    .map((li) => {
      const spans = li.querySelectorAll('span')
      return { label: spans[1].textContent, count: Number(spans[2].textContent), percent: Number((spans[3].textContent ?? '').replace('%', '')) }
    })
}

/** The horizontal bars: name, count and share for each group, then the total. */
function overview() {
  const figure = chart(/Achievement Overview/)
  const rows = within(figure)
    .getAllByRole('listitem')
    .map((li) => {
      const count = li.querySelector('.tabular-nums')!
      return { label: li.querySelector('span')!.textContent, count: Number(count.firstChild!.textContent), percent: Number(count.querySelector('span')!.textContent!.replace('%', '')) }
    })
  const total = Number(within(figure).getByText('Total records').nextElementSibling!.textContent)
  return { rows, total }
}

const barSummary = () => within(chart(/Achievement Comparison/)).getByRole('img').getAttribute('aria-label')

const BY_GROUP = ['Winners', 'Runners-up', 'Participants', 'Other / Unclassified']
const asList = (f: Figures) => [f.winner, f.runner_up, f.participant, f.other]

/** Every chart says what the cards say. */
function expectChartsToMatch(f: Figures) {
  expect(cardFigures()).toEqual(f)
  expect(legend().map((d) => [d.label, d.count])).toEqual(BY_GROUP.map((label, i) => [label, asList(f)[i]]))
  expect(overview().rows.map((d) => [d.label, d.count])).toEqual(BY_GROUP.map((label, i) => [label, asList(f)[i]]))
  expect(overview().total).toBe(f.total)
  expect(barSummary()).toBe(`Bar chart. ${BY_GROUP.map((label, i) => `${label}: ${asList(f)[i]}`).join(', ')}. Total: ${f.total}.`)
  // The four groups add up to the total, and the shares to 100.
  expect(asList(f).reduce((s, v) => s + v, 0)).toBe(f.total)
  if (f.total > 0) {
    expect(legend().reduce((s, d) => s + d.percent, 0)).toBe(100)
    expect(overview().rows.map((d) => d.percent)).toEqual(legend().map((d) => d.percent))
  }
}

const SEEDED: Figures = { total: 21, winner: 5, runner_up: 2, participant: 10, other: 4 }

describe('Achievement Analytics on the Faculty Dashboard', () => {
  it('sits between the statistics cards and the recently submitted records', () => {
    renderDashboard()
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(after(cards(), analytics())).toBe(true)
    expect(after(analytics(), screen.getByRole('heading', { name: 'Recently submitted' }))).toBe(true)
    expect(within(analytics()).getByRole('heading', { name: 'Achievement Analytics' })).toBeTruthy()
  })

  it('draws the doughnut, comparison and overview charts', () => {
    renderDashboard()
    expect(chart(/Achievement Distribution/)).toBeTruthy()
    expect(chart(/Achievement Comparison/)).toBeTruthy()
    expect(chart(/Achievement Overview/)).toBeTruthy()
  })

  it('shows the same numbers as the statistics cards, for all four categories', () => {
    renderDashboard()
    expectChartsToMatch(SEEDED)
    // Winners, runners-up, participants and other each get a percentage (24 + 9 + 48 + 19).
    expect(legend().map((d) => d.percent)).toEqual([24, 9, 48, 19])
    expect(chart(/Achievement Distribution/).querySelector('svg')!.textContent).toContain('21')
  })

  it('colours the doughnut dark purple, lavender, gold and grey', () => {
    renderDashboard()
    const arcs = [...chart(/Achievement Distribution/).querySelectorAll('svg g circle')].map((c) => c.getAttribute('stroke'))
    expect(arcs).toEqual(['var(--color-navy-800)', 'var(--color-lavender-300)', 'var(--color-gold)', '#9ca3af'])
  })

  it('follows a new submission straight away, with no reload', () => {
    renderDashboard()
    const seed = getState().achievements.find((a) => a.studentId === 'stu-09' && a.achievementType === 'Winner')!
    act(() => setState((s) => ({ ...s, achievements: [...s.achievements, { ...seed, id: 'ach-new-1', reference: 'REF-NEW-1', achievementType: 'Winner' }] })))
    expectChartsToMatch({ total: 22, winner: 6, runner_up: 2, participant: 10, other: 4 })

    act(() => setState((s) => ({ ...s, achievements: [...s.achievements, { ...seed, id: 'ach-new-2', reference: 'REF-NEW-2', achievementType: 'Finalist' }] })))
    expectChartsToMatch({ total: 23, winner: 6, runner_up: 2, participant: 10, other: 5 })
  })

  it('leaves out archived records, exactly as the cards do', () => {
    renderDashboard()
    act(() => setState((s) => ({ ...s, achievements: s.achievements.map((a) => (a.studentId === 'stu-09' && a.achievementType === 'Winner' ? { ...a, status: 'archived' as const } : a)) })))
    expectChartsToMatch({ total: 20, winner: 4, runner_up: 2, participant: 10, other: 4 })
  })

  it('counts a record once even if the list holds it twice', () => {
    renderDashboard()
    const seed = getState().achievements.find((a) => a.studentId === 'stu-09' && a.achievementType === 'Winner')!
    act(() => setState((s) => ({ ...s, achievements: [...s.achievements, { ...seed }] })))
    expect(legend().map((d) => d.count)).toEqual([5, 2, 10, 4])
    expect(overview().total).toBe(21)
  })

  it('does not count records from departments the faculty member does not cover', () => {
    renderDashboard()
    const others = getState().achievements.filter((a) => ['stu-03', 'stu-04', 'stu-05'].includes(a.studentId)).length
    expect(others).toBeGreaterThan(0)
    expect(cardFigures().total).toBe(21)
    expect(legend().reduce((s, d) => s + d.count, 0)).toBe(21)
  })

  describe('search and filters', () => {
    it('narrow the charts by search, and leave the statistics cards alone', async () => {
      renderDashboard()
      fireEvent.change(within(analytics()).getByLabelText('Search records to chart'), { target: { value: 'Sana' } })
      expect(legend().map((d) => d.count)).toEqual([1, 0, 2, 1])
      expect(overview().total).toBe(4)
      expect(barSummary()).toBe('Bar chart. Winners: 1, Runners-up: 0, Participants: 2, Other / Unclassified: 1. Total: 4.')
      expect(within(analytics()).getByText('4 of 21 records')).toBeTruthy()
      expect(chart(/Achievement Distribution/).querySelector('svg text')!.textContent).toBe('4') // the doughnut's centre follows too
      expect(cardFigures()).toEqual(SEEDED)
    })

    it('narrow the charts by category', () => {
      renderDashboard()
      fireEvent.change(within(analytics()).getByLabelText('Chart category'), { target: { value: 'Hackathon' } })
      expect(legend().map((d) => [d.count, d.percent])).toEqual([[2, 50], [1, 25], [0, 0], [1, 25]])
      expect(overview().total).toBe(4)
    })

    it('narrow the charts by department, and by year', () => {
      renderDashboard()
      fireEvent.change(within(analytics()).getByLabelText('Chart department'), { target: { value: 'AIDS' } })
      expect(legend().map((d) => d.count)).toEqual([1, 1, 4, 1])
      fireEvent.change(within(analytics()).getByLabelText('Chart year'), { target: { value: '4' } })
      expect(legend().map((d) => d.count)).toEqual([1, 0, 2, 1]) // only the fourth-year AIDS student, Sana
    })

    it('add up to the filtered total and to 100% whatever is chosen', () => {
      renderDashboard()
      for (const category of ['Hackathon', 'Workshop', 'Competition', 'Internship', 'Conference', 'Sports', 'Cultural']) {
        fireEvent.change(within(analytics()).getByLabelText('Chart category'), { target: { value: category } })
        const counts = legend().map((d) => d.count)
        if (counts.reduce((s, v) => s + v, 0) === 0) continue
        expect(counts.reduce((s, v) => s + v, 0)).toBe(overview().total)
        expect(legend().reduce((s, d) => s + d.percent, 0)).toBe(100)
      }
    })

    it('say so when nothing matches, and Clear filters brings the charts back', () => {
      renderDashboard()
      fireEvent.change(within(analytics()).getByLabelText('Search records to chart'), { target: { value: 'no such student' } })
      expect(within(analytics()).getByText('No records match')).toBeTruthy()
      expect(within(analytics()).queryByRole('figure')).toBeNull()
      fireEvent.click(within(analytics()).getByRole('button', { name: 'Clear filters' }))
      expectChartsToMatch(SEEDED)
    })

    it('do not change the table’s own filters, which keep working', () => {
      renderDashboard()
      fireEvent.change(within(analytics()).getByLabelText('Chart category'), { target: { value: 'Sports' } })
      expect(screen.getByLabelText('Search records')).toBeTruthy()
      expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('all')
    })
  })

  it('shows an empty state instead of empty charts when there are no records at all', () => {
    renderDashboard()
    act(() => setState((s) => ({ ...s, achievements: [] })))
    expect(within(analytics()).getByText('No achievement data to chart yet')).toBeTruthy()
    expect(within(analytics()).queryByRole('figure')).toBeNull()
    expect(cardFigures()).toEqual({ total: 0, winner: 0, runner_up: 0, participant: 0, other: 0 })
  })

  it('keeps the existing dashboard: header, cards, recent records, shortcuts', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: /achievements are on record/ })).toBeTruthy()
    for (const label of ['Total Records', 'Winners', 'Runners-up', 'Participants', 'Other / Unclassified', 'Students with Records']) {
      expect(within(cards()).getByText(label)).toBeTruthy()
    }
    expect(screen.getByRole('table', { name: 'Recently submitted achievement records' })).toBeTruthy()
    for (const link of ['Batch Achievements', 'Students', 'Academic Reports']) expect(screen.getByRole('link', { name: new RegExp(link) })).toBeTruthy()
  })
})
