import type { ReactNode } from 'react'
import { useId } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CHEVRON } from './FormField'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search', className }: SearchInputProps) {
  const id = useId()
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-line-strong bg-white pr-9 pl-9 text-[13.5px] placeholder:text-ink-muted/80 focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:bg-parchment hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

interface FilterSelectProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}

export function FilterSelect<T extends string>({ label, value, onChange, options, className }: FilterSelectProps<T>) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ backgroundImage: CHEVRON }}
        className={cn(
          'h-9 w-full appearance-none rounded-lg border bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-[13.5px] focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none',
          value !== 'all' ? 'border-lavender-300 bg-lavender-50 text-ink' : 'border-line-strong text-ink-soft',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Horizontal toolbar that wraps search + filters and an optional reset action. */
export function FilterBar({ children, onReset, active, resultLabel }: { children: ReactNode; onReset?: () => void; active?: boolean; resultLabel?: string }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center" role="search">
      {children}
      <div className="flex items-center gap-3 md:ml-auto">
        {resultLabel && (
          <p className="text-[13px] text-ink-muted" aria-live="polite">
            {resultLabel}
          </p>
        )}
        {onReset && active && (
          <button type="button" onClick={onReset} className="text-[13px] font-medium text-navy-800 underline underline-offset-2">
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
