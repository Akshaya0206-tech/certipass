import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

/**
 * Client-side paging for a list. The page resets to 1 whenever `resetKey`
 * changes (pass something that reflects the current search and filters).
 */
export function usePagination<T>(rows: T[], pageSize = 10, resetKey = '') {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  useEffect(() => setPage(1), [resetKey])
  const current = Math.min(page, pageCount)
  const pageRows = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize])
  return { page: current, pageCount, pageRows, setPage, from: rows.length ? (current - 1) * pageSize + 1 : 0, to: Math.min(current * pageSize, rows.length), total: rows.length }
}

interface PaginationProps {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  onPage: (page: number) => void
  noun?: string
}

export function Pagination({ page, pageCount, from, to, total, onPage, noun = 'records' }: PaginationProps) {
  if (total === 0) return null
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-muted">
      <p aria-live="polite">
        Showing <span className="font-medium text-ink">{from}–{to}</span> of {total} {noun}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} icon={<ChevronLeft className="size-4" aria-hidden />}>
            Previous
          </Button>
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <Button variant="secondary" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pageCount} iconRight={<ChevronRight className="size-4" aria-hidden />}>
            Next
          </Button>
        </div>
      )}
    </nav>
  )
}
