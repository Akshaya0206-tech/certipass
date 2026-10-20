/*
 * Lightweight, dependency-free charts for the admin analytics preview.
 * Each chart: one job, direct labels, a hover read-out, and a table view
 * so no value depends on colour alone.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { RESULT_GROUPS } from '../../domain/result'
import type { ResultGroup } from '../../domain/result'
import { cn } from '../../lib/cn'

interface ChartFrameProps {
  title: string
  calculation: string
  children: ReactNode
  table: { headers: string[]; rows: (string | number)[][] }
  className?: string
  /** Show this message instead of the chart when there is nothing to plot. */
  emptyMessage?: string
}

/** Card wrapper: title, demonstration label, stated calculation and a table toggle. */
export function ChartFrame({ title, calculation, children, table, className, emptyMessage }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)
  return (
    <figure className={cn('paper flex flex-col p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <figcaption className="font-serif text-[15px] text-navy-900">{title}</figcaption>
        <span className="label-archival shrink-0 rounded-sm border border-lavender-300 bg-lavender-50 px-1.5 py-0.5 text-[9px] text-lavender-700">Demo data</span>
      </div>
      <p className="mt-1 text-[12px] text-ink-muted">{calculation}</p>
      <div className="mt-5 flex-1">
        {!showTable &&
          (emptyMessage ? (
            <p role="status" className="flex h-full min-h-28 items-center justify-center rounded border border-dashed border-line-strong px-4 text-center text-[13px] text-ink-muted">
              {emptyMessage}
            </p>
          ) : (
            children
          ))}
        <div className={showTable ? 'overflow-x-auto' : 'sr-only'}>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  {table.headers.map((h, i) => (
                    <th key={h} scope="col" className={cn('label-archival py-1.5 font-medium', i > 0 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={String(r[0])} className="border-b border-line/60 last:border-0">
                    {r.map((c, i) => (
                      <td key={i} className={cn('py-1.5', i > 0 && 'text-right tabular-nums')}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowTable((s) => !s)}
        aria-pressed={showTable}
        className="mt-4 self-start text-[12.5px] font-medium text-navy-800 underline-offset-2 hover:underline"
      >
        {showTable ? 'Show chart' : 'View as table'}
      </button>
    </figure>
  )
}

/** Horizontal bars — magnitude per category. Single hue; every bar is labelled. */
export function BarList({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const [hover, setHover] = useState<string | null>(null)
  return (
    <ul className="space-y-2" aria-hidden>
      {data.map((d) => (
        <li
          key={d.label}
          className="grid grid-cols-[118px_1fr_28px] items-center gap-3 text-[13px]"
          onMouseEnter={() => setHover(d.label)}
          onMouseLeave={() => setHover(null)}
        >
          <span className={cn('truncate', hover === d.label ? 'text-navy-900' : 'text-ink-soft')}>{d.label}</span>
          <span className="h-[14px] rounded-r bg-parchment/70">
            <span
              className={cn('block h-full rounded-r-[4px] transition-colors', hover === d.label ? 'bg-lavender-500' : 'bg-lavender-300')}
              style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 3 : 0 }}
            />
          </span>
          <span className="text-right tabular-nums text-ink">{d.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** Columns over time — one series, so no legend. Peak is labelled; hover reveals each value. */
export function ColumnChart({ data }: { data: { key: string; label: string; count: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0])
  // Keep the axis readable: about eight labels however many columns there are.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))
  const [hover, setHover] = useState<string | null>(null)
  // De-duplicated: with a maximum of 1 the middle tick would repeat the top one.
  const ticks = [...new Set([0, Math.ceil(max / 2), max])]
  return (
    <div className="relative pl-6" aria-hidden>
      <div className="relative h-44">
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 left-0 border-t border-line/70" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -top-2 -left-6 w-5 text-right text-[10px] text-ink-muted tabular-nums">{t}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d) => {
            const showLabel = hover === d.key || (hover === null && d.key === peak.key && d.count > 0)
            return (
              <div
                key={d.key}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={cn('w-full max-w-[26px] rounded-t-[4px] transition-colors', hover === d.key ? 'bg-lavender-500' : 'bg-lavender-300')}
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
                />
                {showLabel && (
                  <span
                    className="absolute rounded bg-navy-800 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-ivory tabular-nums"
                    style={{ bottom: `calc(${(d.count / max) * 100}% + 6px)` }}
                  >
                    {d.label}: {d.count}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 overflow-visible text-center text-[10px] whitespace-nowrap text-ink-muted">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

const RESULT_FILL: Record<ResultGroup, string> = {
  winner: 'bg-navy-800',
  runner_up: 'bg-lavender-500',
  participant: 'bg-sky-500',
  other: 'bg-butter-500',
}

/**
 * Part-to-whole split by recorded achievement result: one 100% bar with 2px
 * gaps and a labelled legend (count + share). The groups are results the
 * students recorded, never approval states.
 */
export function ResultSplit({ data }: { data: { group: ResultGroup; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1
  const [hover, setHover] = useState<ResultGroup | null>(null)
  return (
    <div aria-hidden>
      <div className="flex h-7 gap-[2px] overflow-hidden rounded-md">
        {data
          .filter((d) => d.count > 0)
          .map((d) => (
            <div
              key={d.group}
              className={cn('h-full transition-opacity', RESULT_FILL[d.group], hover && hover !== d.group && 'opacity-35')}
              style={{ width: `${(d.count / total) * 100}%` }}
              onMouseEnter={() => setHover(d.group)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        {data.map((d) => (
          <li key={d.group} className="flex items-start gap-2 text-[13px]" onMouseEnter={() => setHover(d.group)} onMouseLeave={() => setHover(null)}>
            <span className={cn('mt-1 size-2.5 shrink-0 rounded-sm', RESULT_FILL[d.group])} />
            <span>
              <span className="block text-ink-soft">{RESULT_GROUPS[d.group].label}</span>
              <span className="font-serif text-[15px] text-navy-900 tabular-nums">{d.count}</span>
              <span className="ml-1.5 text-[12px] text-ink-muted">{Math.round((d.count / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Per-department record total, with the winners' share filled inside it. */
export function DepartmentBars({ data }: { data: { code: string; total: number; winners: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div aria-hidden>
      <div className="mb-3 flex gap-4 text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-navy-800" /> Winners
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-lavender-300 bg-lavender-100" /> All records
        </span>
      </div>
      <ul className="space-y-2.5">
        {data.map((d) => (
          <li key={d.code} className="grid grid-cols-[44px_1fr_64px] items-center gap-3 text-[13px]" title={`${d.code}: ${d.winners} won of ${d.total}`}>
            <span className="font-mono text-[12px] text-ink-soft">{d.code}</span>
            <span className="relative h-[16px]">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] border border-lavender-300 bg-lavender-100" style={{ width: `${(d.total / max) * 100}%` }} />
              <span className="absolute inset-y-[3px] left-0 rounded-r-[3px] bg-navy-800" style={{ width: `${(d.winners / max) * 100}%` }} />
            </span>
            <span className="text-right text-ink tabular-nums">
              {d.winners}
              <span className="text-ink-muted"> / {d.total}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
