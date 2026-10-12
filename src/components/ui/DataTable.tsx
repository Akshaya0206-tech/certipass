import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
  /** Hide on narrow screens; the essential columns stay visible. */
  hideBelow?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right'
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption: string
  empty?: ReactNode
  onRowClick?: (row: T) => void
  className?: string
}

export function DataTable<T>({ columns, rows, rowKey, caption, empty, onRowClick, className }: DataTableProps<T>) {
  return (
    <div className={cn('paper relative overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-ivory">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-3 py-2.5 first:pl-4 last:pr-4 text-[12px] font-medium whitespace-nowrap text-ink-muted',
                  c.hideBelow && hide[c.hideBelow],
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-lavender-50')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-3 py-3 align-middle first:pl-4 last:pr-4', c.hideBelow && hide[c.hideBelow], c.align === 'right' && 'text-right', c.className)}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
