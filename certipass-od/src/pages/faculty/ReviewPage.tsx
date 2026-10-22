import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Download, FileQuestion, X } from 'lucide-react'
import { ApplicationTimeline } from '../../components/ApplicationTimeline'
import { DecisionPanel, DocumentList, EventInfo, StudentInfo } from '../../components/ApplicationDetails'
import { Button, LinkButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Field, TextArea } from '../../components/ui/FormField'
import { Section } from '../../components/ui/PageHeader'
import { EmptyState, InlineAlert } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import { useUser } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAppState } from '../../hooks/useData'
import { ApiError } from '../../services/auth'
import { canReview, decide, getApplication } from '../../services/odService'

/** Used by faculty and administrators; the service re-checks permission on every decision. */
export default function ReviewPage() {
  const { id = '' } = useParams()
  const user = useUser()
  const toast = useToast()
  const state = useAppState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const app = useMemo(() => getApplication(id), [id, state])
  const [action, setAction] = useState<'approved' | 'rejected' | null>(null)
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const back = user.role === 'admin' ? '/admin/reports' : '/faculty/pending'

  if (!app) {
    return (
      <div className="panel">
        <EmptyState icon={FileQuestion} title="Application not found" body="It may not exist, or it is outside the applications you are allowed to see." action={<LinkButton to={back} variant="secondary">Back to the list</LinkButton>} />
      </div>
    )
  }

  const mayReview = canReview(user)
  const needsReason = action === 'rejected'
  const reasonError = needsReason && remarks.trim().length < 10 ? 'Give a reason of at least 10 characters. The student will see it.' : ''

  function close() {
    if (busy) return
    setAction(null)
    setRemarks('')
    setError('')
  }

  async function confirm() {
    if (!action || reasonError) return
    setBusy(true)
    setError('')
    try {
      await decide(app!.id, action, remarks)
      toast.success(action === 'approved' ? `Approved. OD pass issued for ${app!.studentName}.` : `Rejected. ${app!.studentName} can see your reason.`)
      setBusy(false)
      setAction(null)
      setRemarks('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The decision could not be saved.')
      setBusy(false)
    }
  }

  return (
    <div>
      <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-purple hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Back to applications
      </Link>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-ink-muted">{app.id}</p>
          <h1 className="page-title">{app.eventName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={app.status} />
            <span className="text-sm text-ink-soft">
              {app.studentName} · <span className="font-mono">{app.registerNo}</span>
            </span>
          </div>
        </div>
        {app.status === 'approved' && app.passNumber && (
          <LinkButton to={`/${user.role}/passes/${app.id}`} variant="accent">
            <Download className="size-4" aria-hidden /> View Pass
          </LinkButton>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <StudentInfo app={app} />
          <EventInfo app={app} />
          <DocumentList docs={app.documents} />
        </div>
        <div className="space-y-5">
          {app.status === 'pending' ? (
            <Section title="Decision">
              <div className="space-y-3 p-4">
                {mayReview ? (
                  <>
                    <p className="text-sm text-ink-soft">Check the details and documents, then approve or reject. A decision is final and is recorded with your name.</p>
                    <div className="flex flex-col gap-2">
                      <Button variant="accent" onClick={() => setAction('approved')}>
                        <Check className="size-4" aria-hidden /> Approve
                      </Button>
                      <Button variant="danger" onClick={() => setAction('rejected')}>
                        <X className="size-4" aria-hidden /> Reject
                      </Button>
                    </div>
                  </>
                ) : (
                  <InlineAlert tone="warning">Your account can view applications but has not been given permission to approve or reject them.</InlineAlert>
                )}
              </div>
            </Section>
          ) : (
            <DecisionPanel app={app} />
          )}
          <Section title="Timeline and audit history">
            <div className="p-4 pl-6">
              <ApplicationTimeline app={app} />
            </div>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={action !== null}
        title={action === 'approved' ? 'Approve this application?' : 'Reject this application?'}
        description={
          action === 'approved'
            ? `An OD pass will be issued to ${app.studentName} for ${app.eventName}. This cannot be undone.`
            : `${app.studentName} will be told the application was rejected, along with your reason. This cannot be undone.`
        }
        confirmLabel={action === 'approved' ? 'Yes, approve' : 'Yes, reject'}
        tone={action === 'approved' ? 'accent' : 'danger'}
        loading={busy}
        confirmDisabled={!!reasonError}
        onClose={close}
        onConfirm={confirm}
      >
        <div className="mt-4 space-y-3">
          <Field label={needsReason ? 'Reason for rejection' : 'Remarks (optional)'} required={needsReason} error={remarks && reasonError ? reasonError : undefined} hint={needsReason ? 'Be specific so the student knows what to correct.' : undefined}>
            <TextArea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={500} />
          </Field>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
        </div>
      </ConfirmDialog>
    </div>
  )
}
