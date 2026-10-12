import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FilePen, Trash2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { useStudent } from '../../hooks/useData'
import { formatRelative } from '../../lib/format'
import { categoryLabel, stepStates, WIZARD_STEPS } from '../../services/achievementValidation'
import { deleteDraft, draftTitle } from '../../services/submissionService'
import type { AchievementDraft } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

export const draftHref = (id: string) => `/student/achievements/new?draft=${encodeURIComponent(id)}`

/**
 * Unfinished submissions. Styled with dashed borders and a "Draft" tag so
 * they are never mistaken for submitted or verified achievements.
 */
export function DraftList({ drafts, compact }: { drafts: AchievementDraft[]; compact?: boolean }) {
  const student = useStudent()
  const toast = useToast()
  const [confirming, setConfirming] = useState<AchievementDraft | null>(null)

  if (!drafts.length) return null

  return (
    <>
      <ul className="divide-y divide-dashed divide-line-strong rounded-md border border-dashed border-line-strong bg-parchment/40" aria-label="Drafts">
        {drafts.map((d) => {
          const done = stepStates(d.form, false).filter((s) => s === 'complete').length
          return (
            <li key={d.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-muted">
                  <FilePen className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="truncate font-medium text-navy-900">{draftTitle(d)}</span>
                    <span className="rounded-sm border border-dashed border-ink-muted/50 px-1.5 font-mono text-[10px] tracking-wider text-ink-muted uppercase">Draft</span>
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted">
                    {d.form.category ? `${categoryLabel(d.form)} · ` : ''}
                    Step {d.step + 1} of {WIZARD_STEPS.length} ({WIZARD_STEPS[d.step]})
                    {!compact && ` · ${done} of 5 sections filled in`} · saved {formatRelative(d.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 pl-12 sm:pl-0">
                <Link
                  to={draftHref(d.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-[13px] font-medium text-navy-900 hover:border-navy-700"
                >
                  Continue <ArrowRight className="size-3.5" aria-hidden />
                  <span className="sr-only">draft: {draftTitle(d)}</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(d)} icon={<Trash2 className="size-4" aria-hidden />}>
                  Delete<span className="sr-only"> draft: {draftTitle(d)}</span>
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        size="sm"
        title="Delete this draft?"
        description={confirming ? draftTitle(confirming) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirming) return
                const removed = deleteDraft(student.id, confirming.id)
                if (removed) toast.success('Draft deleted')
                else toast.error('Draft not found', 'It may already have been deleted.')
                setConfirming(null)
              }}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Everything entered in this draft will be removed. This can’t be undone. Submitted achievements aren’t affected.</p>
      </Dialog>
    </>
  )
}
