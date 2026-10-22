import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileCheck2, FileQuestion, Save, Send } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '../../components/ui/FormField'
import { FileUpload } from '../../components/ui/FileUpload'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState, InlineAlert } from '../../components/ui/States'
import { LinkButton } from '../../components/ui/Button'
import { useToast } from '../../context/ToastContext'
import { useUser } from '../../context/AuthContext'
import { departmentName } from '../../data/seed'
import { useAppState } from '../../hooks/useData'
import { dayCount, todayISO } from '../../lib/format'
import { ApiError } from '../../services/auth'
import { emptyInput, getApplication, saveDraft, submitApplication, validateApplication } from '../../services/odService'
import type { ApplicationInput, FieldErrors } from '../../services/odService'
import { EVENT_TYPES } from '../../types'
import type { EventType } from '../../types'

function FormSection({ letter, title, description, children }: { letter: string; title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="panel min-w-0 p-0">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-purple text-sm font-semibold text-white" aria-hidden>
          {letter}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-purple-dark">{title}</h2>
          {description && <p className="text-xs text-ink-muted">{description}</p>}
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">{children}</div>
    </fieldset>
  )
}

export default function ApplyPage() {
  const { id } = useParams()
  const user = useUser()
  const navigate = useNavigate()
  const toast = useToast()
  const state = useAppState()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const existing = useMemo(() => (id ? getApplication(id) : null), [id, state])
  const editable = !id || (existing && existing.status === 'draft')

  const [input, setInput] = useState<ApplicationInput>(() =>
    existing && existing.status === 'draft'
      ? {
          eventName: existing.eventName,
          eventType: existing.eventType,
          organizer: existing.organizer,
          venue: existing.venue,
          eventStart: existing.eventStart,
          eventEnd: existing.eventEnd,
          odFrom: existing.odFrom,
          odUntil: existing.odUntil,
          reason: existing.reason,
          link: existing.link,
          documents: existing.documents,
          declaration: false,
        }
      : emptyInput(),
  )
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const [serverError, setServerError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const all: FieldErrors = validateApplication(input, 'submit')
  const show = (k: keyof ApplicationInput): string | undefined => (attempted || touched.has(k) ? all[k] : undefined)
  const blur = (k: keyof ApplicationInput) => () => setTouched((t) => new Set(t).add(k))

  function set<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setDirty(true)
    setServerError('')
    setInput((cur) => {
      const next = { ...cur, [key]: value }
      // Convenience: the OD window usually starts and ends with the event, so keep it in step
      // until the student sets their own OD dates.
      if (key === 'eventStart' && (!cur.odFrom || cur.odFrom === cur.eventStart)) next.odFrom = value as string
      if (key === 'eventEnd' && (!cur.odUntil || cur.odUntil === cur.eventEnd)) next.odUntil = value as string
      return next
    })
  }

  if (id && !existing) {
    return (
      <div className="panel">
        <EmptyState icon={FileQuestion} title="Draft not found" body="This draft does not exist or belongs to another account." action={<LinkButton to="/student/applications" variant="secondary">Back to my applications</LinkButton>} />
      </div>
    )
  }
  if (!editable) {
    return (
      <div className="panel">
        <EmptyState icon={FileCheck2} title="This application has been submitted" body="Submitted applications cannot be edited. You can view its details and status instead." action={<LinkButton to={`/student/applications/${id}`} variant="primary">View details</LinkButton>} />
      </div>
    )
  }

  async function onSaveDraft() {
    setServerError('')
    if (!input.eventName.trim()) {
      setTouched((t) => new Set(t).add('eventName'))
      return
    }
    setBusy('draft')
    try {
      const app = await saveDraft(input, id)
      setDirty(false)
      toast.success('Draft saved. You can finish it later from My Applications.')
      if (!id) navigate(`/student/apply/${app.id}`, { replace: true })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'The draft could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  async function onSubmit() {
    setAttempted(true)
    setServerError('')
    if (Object.keys(all).length) {
      toast.error('Please fix the highlighted fields before submitting.')
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy('submit')
    try {
      const app = await submitApplication(input, id)
      navigate(`/student/apply/submitted/${app.id}`, { replace: true })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'The application could not be submitted.')
      setBusy(null)
    }
  }

  const days = dayCount(input.odFrom, input.odUntil)
  const today = todayISO()

  return (
    <div>
      <PageHeader title={id ? 'Edit draft' : 'Apply for OD pass'} description="Fill in the event details and attach proof. Your reviewer will see exactly what you submit here." />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void onSubmit()
        }}
        className="space-y-5"
      >
        <FormSection letter="A" title="Student information" description="Taken from your verified profile. These fields cannot be changed here.">
          <Field label="Student name" locked>
            <TextInput value={user.name} readOnly />
          </Field>
          <Field label="Register number" locked>
            <TextInput value={user.registerNo ?? ''} readOnly className="font-mono" />
          </Field>
          <Field label="Department" locked>
            <TextInput value={departmentName(user.department)} readOnly />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Year" locked>
              <TextInput value={user.year ?? ''} readOnly />
            </Field>
            <Field label="Section" locked>
              <TextInput value={user.section ?? ''} readOnly />
            </Field>
          </div>
          <Field label="College email" locked className="sm:col-span-2">
            <TextInput value={user.email} readOnly />
          </Field>
        </FormSection>

        <FormSection letter="B" title="Event information">
          <Field label="Event name" required error={show('eventName')} className="sm:col-span-2">
            <TextInput value={input.eventName} onChange={(e) => set('eventName', e.target.value)} onBlur={blur('eventName')} maxLength={120} />
          </Field>
          <Field label="Event type" required error={show('eventType')}>
            <SelectInput value={input.eventType} onChange={(e) => set('eventType', e.target.value as EventType)} onBlur={blur('eventType')}>
              <option value="">Select a type</option>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Organising institution or organisation" required error={show('organizer')}>
            <TextInput value={input.organizer} onChange={(e) => set('organizer', e.target.value)} onBlur={blur('organizer')} />
          </Field>
          <Field label="Event venue" required error={show('venue')} className="sm:col-span-2">
            <TextInput value={input.venue} onChange={(e) => set('venue', e.target.value)} onBlur={blur('venue')} />
          </Field>
          <Field label="Event start date" required error={show('eventStart')}>
            <TextInput type="date" value={input.eventStart} onChange={(e) => set('eventStart', e.target.value)} onBlur={blur('eventStart')} />
          </Field>
          <Field label="Event end date" required error={show('eventEnd')}>
            <TextInput type="date" min={input.eventStart || undefined} value={input.eventEnd} onChange={(e) => set('eventEnd', e.target.value)} onBlur={blur('eventEnd')} />
          </Field>
          <Field label="OD required from" required error={show('odFrom')} hint="Include a travel day if you need one.">
            <TextInput type="date" value={input.odFrom} onChange={(e) => set('odFrom', e.target.value)} onBlur={blur('odFrom')} />
          </Field>
          <Field label="OD required until" required error={show('odUntil')} hint={days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} requested` : undefined}>
            <TextInput type="date" min={input.odFrom || undefined} value={input.odUntil} onChange={(e) => set('odUntil', e.target.value)} onBlur={blur('odUntil')} />
          </Field>
          {input.eventStart && input.eventStart < today && (
            <div className="sm:col-span-2">
              <InlineAlert tone="warning">This event starts in the past. Late requests may need extra explanation in the reason below.</InlineAlert>
            </div>
          )}
          <Field label="Reason for request" required error={show('reason')} hint={`${input.reason.length}/600 characters`} className="sm:col-span-2">
            <TextArea value={input.reason} onChange={(e) => set('reason', e.target.value)} onBlur={blur('reason')} maxLength={600} rows={4} />
          </Field>
          <Field label="Event website or reference link (optional)" error={show('link')} className="sm:col-span-2">
            <TextInput type="url" inputMode="url" placeholder="https://" value={input.link} onChange={(e) => set('link', e.target.value)} onBlur={blur('link')} />
          </Field>
        </FormSection>

        <section className="panel p-0">
          <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-purple text-sm font-semibold text-white" aria-hidden>
              C
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-purple-dark">Supporting documents</h2>
              <p className="text-xs text-ink-muted">Attach the invitation letter, event brochure, or other proof of participation.</p>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <FileUpload value={input.documents} onChange={(d) => set('documents', d)} error={show('documents')} />
          </div>
        </section>

        <section className="panel p-0">
          <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-purple text-sm font-semibold text-white" aria-hidden>
              D
            </span>
            <h2 className="text-[15px] font-semibold text-purple-dark">Confirmation</h2>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <Checkbox
              label="I confirm that the information and documents I have provided are accurate and that I will attend the event stated."
              checked={input.declaration}
              onChange={(e) => set('declaration', e.target.checked)}
              error={show('declaration')}
            />
            {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => (dirty ? setLeaving(true) : navigate('/student'))} disabled={busy !== null}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={onSaveDraft} loading={busy === 'draft'} disabled={busy === 'submit'}>
                <Save className="size-4" aria-hidden /> Save as Draft
              </Button>
              <Button type="submit" variant="accent" loading={busy === 'submit'} disabled={busy === 'draft'}>
                {busy !== 'submit' && <Send className="size-4" aria-hidden />} Submit Application
              </Button>
            </div>
          </div>
        </section>
      </form>

      <ConfirmDialog open={leaving} title="Discard your changes?" description="You have unsaved changes on this form. If you leave now they will be lost." confirmLabel="Discard and leave" tone="danger" onClose={() => setLeaving(false)} onConfirm={() => navigate('/student')} />
    </div>
  )
}
