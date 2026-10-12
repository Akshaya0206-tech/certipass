import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BadgeCheck, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '../lib/cn'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: string
}

interface ToastApi {
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
  info: (title: string, body?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const toneStyles: Record<ToastTone, { icon: typeof Info; rule: string; iconClass: string }> = {
  success: { icon: BadgeCheck, rule: 'bg-navy-800', iconClass: 'text-navy-800' },
  error: { icon: CircleAlert, rule: 'bg-terracotta-500', iconClass: 'text-terracotta-600' },
  info: { icon: Info, rule: 'bg-lavender-500', iconClass: 'text-lavender-700' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = ++counter.current
      setToasts((t) => [...t.slice(-3), { id, tone, title, body }])
      setTimeout(() => dismiss(id), tone === 'error' ? 6500 : 4500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, b) => push('success', t, b),
      error: (t, b) => push('error', t, b),
      info: (t, b) => push('info', t, b),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const s = toneStyles[t.tone]
          const Icon = s.icon
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto relative flex w-full animate-slide-up gap-3 overflow-hidden rounded-xl border border-line bg-white py-3 pr-3 pl-4 shadow-lift"
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', s.rule)} aria-hidden />
              <Icon className={cn('mt-0.5 size-[18px] shrink-0', s.iconClass)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy-900">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-ink-soft">{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="flex size-6 items-center justify-center rounded text-ink-muted hover:bg-parchment"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
