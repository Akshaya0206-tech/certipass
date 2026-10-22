import type { OdApplication } from '../types'
import { monthKey, monthLabel } from './format'

export interface StatusCounts {
  total: number
  pending: number
  approved: number
  rejected: number
  draft: number
}

export function countByStatus(apps: OdApplication[]): StatusCounts {
  const c: StatusCounts = { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 }
  for (const a of apps) {
    c[a.status] += 1
    if (a.status !== 'draft') c.total += 1
  }
  return c
}

export function countByDepartment(apps: OdApplication[], codes: string[]) {
  return codes.map((code) => {
    const rows = apps.filter((a) => a.department === code && a.status !== 'draft')
    return {
      code,
      total: rows.length,
      approved: rows.filter((a) => a.status === 'approved').length,
    }
  })
}

/** Submitted applications per calendar month for the last `months` months, oldest first. */
export function monthlyTrend(apps: OdApplication[], months = 6, now = new Date()) {
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys.map((key) => {
    const rows = apps.filter((a) => a.submittedAt && monthKey(a.submittedAt) === key)
    return {
      key,
      label: monthLabel(key),
      total: rows.length,
      approved: rows.filter((a) => a.status === 'approved').length,
    }
  })
}
