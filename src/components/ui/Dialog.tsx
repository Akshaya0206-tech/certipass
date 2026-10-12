import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

/**
 * Modal built on the native <dialog> element, which provides focus
 * containment, Escape-to-close and inert background for free.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // No native onClose: the 'close' event also fires (asynchronously) when we close the
      // dialog programmatically, and could then close a dialog opened right after it.
      // User dismissals arrive via onCancel (Escape) and backdrop clicks below.
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-lift backdrop:bg-navy-950/45 open:animate-slide-up',
        widths[size],
      )}
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
            <div>
              <h2 id="dialog-title" className="font-serif text-[16px] text-navy-900">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 flex size-8 items-center justify-center rounded text-ink-muted hover:bg-parchment hover:text-ink"
              aria-label="Close dialog"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-parchment/50 px-6 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
