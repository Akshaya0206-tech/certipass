import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
  /** Hide this column below the lg breakpoint (the mobile card still shows what `card` renders). */
  wide?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Compact card shown instead of the table below the md breakpoint. */
  card: (row: T) => ReactNode
  caption: string
  empty?: ReactNode
}

export function DataTable<T>({ columns, rows, rowKey, card, caption, empty }: DataTableProps<T>) {
  if (rows.length === 0) return <>{empty}</>
  return (
    <>
      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="p-4">
            {card(r)}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line-strong bg-lavender">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('kicker px-4 py-2.5 font-semibold', c.wide && 'hidden xl:table-cell', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-lavender/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle', c.wide && 'hidden xl:table-cell', c.className)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
