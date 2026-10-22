import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
import type { Variant } from './Button'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Native <dialog>: focus is trapped, Escape closes, and the page behind is inert. */
export function Dialog({ open, title, onClose, children, footer, wide }: DialogProps) {
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
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby="dialog-title"
      className={`no-print m-auto w-[calc(100%-2rem)] rounded-md border border-line bg-white p-0 text-ink shadow-pop backdrop:bg-purple-dark/50 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
    >
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id="dialog-title" className="text-base font-semibold text-purple-dark">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-m-1 rounded p-1 text-ink-muted hover:text-ink" aria-label="Close dialog">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line bg-lavender px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: Variant
  loading?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}

export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'primary', loading, confirmDisabled, onConfirm, onClose, children }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={loading ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-soft">{description}</div>
      {children}
    </Dialog>
  )
}
