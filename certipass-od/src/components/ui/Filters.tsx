import { Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

export function SearchInput({ value, onChange, placeholder, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <label htmlFor="search-input" className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        id="search-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-line-strong bg-white pr-9 pl-9 text-sm placeholder:text-ink-muted/70 hover:border-purple-300 focus:border-purple focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink" aria-label="Clear search">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

export interface FilterTab<T extends string> {
  value: T
  label: string
  count?: number
}

/** Status filter strip. Uses buttons with aria-pressed so it is keyboard and screen-reader friendly. */
export function FilterTabs<T extends string>({ tabs, value, onChange, label }: { tabs: FilterTab<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors',
              active ? 'border-purple bg-purple text-white' : 'border-line-strong bg-white text-ink-soft hover:bg-lavender-deep',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-sm px-1.5 text-xs tabular-nums', active ? 'bg-gold text-purple-dark' : 'bg-lavender-deep text-ink-muted')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
