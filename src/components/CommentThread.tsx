import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MessageSquareText, Send } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/cn'
import { formatDateTime, formatRelative, initials } from '../lib/format'
import { addComment, COMMENT_MAX_LENGTH } from '../services/reviewService'
import type { CommentType, PublicUser, ReviewComment } from '../types'
import { Button } from './ui/Button'

interface CommentThreadProps {
  achievementId: string
  comments: ReviewComment[]
  /** Used only to label the viewer's own comments as "You". The author of a new comment is decided by the service. */
  currentUser: PublicUser
  placeholder?: string
  /** Hide the composer (e.g. for read-only viewers). */
  readOnly?: boolean
}

const TYPE_LABEL: Record<CommentType, string | null> = {
  general: null,
  correction_request: 'Correction request',
  review_update: 'Review update',
}

/**
 * The conversation on an achievement. Comments can be added but never edited
 * or deleted, so the record of what was asked and answered stays intact.
 */
export function CommentThread({ achievementId, comments, currentUser, placeholder, readOnly }: CommentThreadProps) {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string>()
  const [posting, setPosting] = useState(false)
  const inFlight = useRef(false)
  const ordered = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return // ignore double clicks / repeated Enter
    if (!draft.trim()) {
      setError('Write a comment before posting.')
      return
    }
    inFlight.current = true
    setPosting(true)
    setError(undefined)
    try {
      // The service takes the author from the signed-in session, not from this component.
      await addComment(achievementId, draft)
      setDraft('')
      toast.success('Comment posted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post the comment.')
    } finally {
      inFlight.current = false
      setPosting(false)
    }
  }

  return (
    <div>
      {ordered.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
          <MessageSquareText className="size-4" aria-hidden />
          No comments yet.
        </p>
      ) : (
        <ol className="space-y-4" aria-label="Comments, oldest first">
          {ordered.map((c) => {
            const mine = c.authorId === currentUser.id
            const typeLabel = TYPE_LABEL[c.type ?? 'general']
            return (
              <li key={c.id} className="flex gap-3">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    c.authorRole === 'student' ? 'bg-lavender-200 text-lavender-700' : 'bg-sky-200 text-sky-700',
                  )}
                  aria-hidden
                >
                  {initials(c.authorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span className="font-medium text-navy-900">{mine ? 'You' : c.authorName}</span>
                    <span className="label-archival text-[9.5px]">{c.authorRole}</span>
                    <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)} className="text-ink-muted">
                      {formatRelative(c.createdAt)}
                    </time>
                    {typeLabel && (
                      <span
                        className={cn(
                          'rounded-sm border px-1.5 text-[10.5px] font-medium',
                          c.type === 'correction_request' ? 'border-terracotta-300 bg-terracotta-50 text-terracotta-700' : 'border-lavender-300 bg-lavender-50 text-lavender-700',
                        )}
                      >
                        {typeLabel}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{c.body}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!readOnly && (
        <form onSubmit={submit} className="mt-5" noValidate>
          <label htmlFor={`comment-${achievementId}`} className="text-[13px] font-medium text-ink-soft">
            Add a comment
          </label>
          <textarea
            id={`comment-${achievementId}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(undefined)
            }}
            placeholder={placeholder ?? 'Write a short, clear note…'}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            readOnly={posting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `comment-${achievementId}-error` : undefined}
            className={cn(
              'mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-lavender-300 focus:outline-none',
              error ? 'border-terracotta-500' : 'border-line-strong focus:border-navy-700',
            )}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p id={`comment-${achievementId}-error`} className="text-[12.5px] text-terracotta-700" role={error ? 'alert' : undefined}>
              {error ?? (
                <span className="text-ink-muted">
                  {draft.length}/{COMMENT_MAX_LENGTH}
                </span>
              )}
            </p>
            <Button type="submit" size="sm" loading={posting} icon={<Send className="size-3.5" aria-hidden />}>
              Post comment
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
