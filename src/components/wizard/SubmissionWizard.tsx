import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CircleDashed, Info, LogOut, Save, Send } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { useStudent } from '../../hooks/useData'
import { cn } from '../../lib/cn'
import { formatRelative } from '../../lib/format'
import {
  emptyForm,
  formFromAchievement,
  OPTIONAL_STEPS,
  STEP,
  stepStates,
  validateForm,
  validateStep,
  WIZARD_STEPS,
} from '../../services/achievementValidation'
import { CertificateStorageError, storageAvailability, uploadCertificate } from '../../services/certificateStorage'
import { ACCEPTED_LABEL, FILE_RULES, formatBytes, inspectCertificateFile, storeCertificate } from '../../services/fileService'
import { createId } from '../../services/store'
import {
  createDraft,
  getPossibleDuplicates,
  SubmissionError,
  submitAchievement,
  updateAndRecordEdit,
  updateDraft,
} from '../../services/submissionService'
import type { Achievement, AchievementDraft, AchievementFormData, CertificateFile, FormField, ValidationError } from '../../types'
import { Breadcrumbs } from '../ui/Breadcrumbs'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { PageHeader } from '../ui/PageHeader'
import { ReviewStep } from './ReviewStep'
import { UploadFailureNotice } from './UploadFailureNotice'
import { UploadStep } from './UploadStep'
import type { SelectedFile } from './UploadStep'
import { AdditionalStep, CategoryStep, EventStep, ResultStep } from './WizardSteps'

export type WizardMode = { kind: 'create' } | { kind: 'draft'; draft: AchievementDraft } | { kind: 'edit'; achievement: Achievement }

const STEP_TITLES = [
  'What kind of achievement are you adding?',
  'Tell us about the event',
  'What did you achieve?',
  'Anything else to add?',
  'Attach the certificate',
  'Review before you submit',
]
const STEP_GUIDANCE = [
  'Pick the closest match. You can change it any time before you submit.',
  'Use the details exactly as they appear on the certificate. Your name and register number are already on file.',
  'Choose the result that matches your certificate. A description is written for you.',
  'All optional. Skip this step if the certificate speaks for itself.',
  `${ACCEPTED_LABEL}, up to ${formatBytes(FILE_RULES.maxBytes)}.`,
  'Check everything once more. Each section can be edited without losing anything.',
]

/** A stable fingerprint of what the student has entered, for unsaved-change detection. */
const fingerprint = (form: AchievementFormData, fileName: string | undefined) => JSON.stringify([form, fileName ?? null])

interface SubmissionWizardProps {
  mode: WizardMode
  /** Called when a draft is first created, so the page can put its id in the URL. */
  onDraftCreated?: (draftId: string) => void
}

export function SubmissionWizard({ mode, onDraftCreated }: SubmissionWizardProps) {
  const student = useStudent()
  const toast = useToast()
  const navigate = useNavigate()
  const editing = mode.kind === 'edit' ? mode.achievement : null
  const initialDraft = mode.kind === 'draft' ? mode.draft : null

  const [form, setForm] = useState<AchievementFormData>(() => (editing ? formFromAchievement(editing) : (initialDraft?.form ?? emptyForm())))
  const [step, setStep] = useState(() => initialDraft?.step ?? 0)
  const [attempted, setAttempted] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [checking, setChecking] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const [draft, setDraft] = useState<AchievementDraft | null>(initialDraft)
  const [baseline, setBaseline] = useState(() => fingerprint(form, undefined))
  /** After "Edit …" on the review step, Continue returns straight to the review. */
  const [returnToReview, setReturnToReview] = useState(false)
  const [duplicates, setDuplicates] = useState<Achievement[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** While submitting: whether the file is still travelling to storage or the record is being saved. */
  const [stage, setStage] = useState<'uploading' | 'saving'>('saving')
  /** Set when the certificate could not reach storage; cleared by the next attempt. */
  const [uploadFailure, setUploadFailure] = useState<string | null>(null)
  /** Whether the last attempt had the duplicate warning acknowledged, so Retry repeats it faithfully. */
  const lastConfirmed = useRef(false)
  const [exitOpen, setExitOpen] = useState(false)
  const inFlight = useRef(false)
  // A new record's id is fixed up front so the file can be uploaded under it before the record exists.
  const newAchievementId = useRef(createId('ach'))
  // One id per chosen file: every retry of the same upload reuses it, so a retry can never store the file twice.
  const uploadId = useRef(crypto.randomUUID())
  const headingRef = useRef<HTMLHeadingElement>(null)

  const hasCertificate = !!selected || !!editing
  const dirty = fingerprint(form, selected?.file.name) !== baseline
  const states = useMemo(() => stepStates(form, hasCertificate), [form, hasCertificate])
  const stepErrors = useMemo(() => validateStep(step, form, hasCertificate), [step, form, hasCertificate])
  const isReview = step === STEP.review
  const lastSavedMissingFile = draft?.certificate && !selected ? draft.certificate : undefined

  // Release the temporary preview URL when the file changes or the wizard closes.
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.objectUrl)
    },
    [selected],
  )

  // Move focus to the step heading when the step changes (not on first render).
  const lastStep = useRef(step)
  useEffect(() => {
    if (lastStep.current === step) return
    lastStep.current = step
    headingRef.current?.focus()
    document.getElementById('main')?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [step])

  // Warn before a refresh or tab close would discard unsaved work.
  useEffect(() => {
    if (!dirty || submitting) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, submitting])

  const set = useCallback(<K extends keyof AchievementFormData>(key: K, value: AchievementFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDuplicates([])
  }, [])

  const error = useCallback(
    (field: FormField) => (attempted.has(step) ? stepErrors.find((e) => e.field === field)?.message : undefined),
    [attempted, step, stepErrors],
  )

  // ── Drafts ──
  const draftCertificate = selected ? { fileName: selected.file.name, fileType: selected.type, sizeBytes: selected.file.size } : draft?.certificate

  /** Create or update the draft. Returns the saved draft, or null when saving isn't applicable or failed. */
  function saveDraft(atStep = step, quiet = false, values = form): AchievementDraft | null {
    if (editing) return null
    try {
      const saved = draft ? updateDraft(student.id, draft.id, values, atStep, draftCertificate) : createDraft(student.id, values, atStep, draftCertificate)
      if (!draft) onDraftCreated?.(saved.id)
      setDraft(saved)
      setBaseline(fingerprint(values, selected?.file.name))
      if (!quiet) toast.success('Draft saved', selected ? 'Your answers are saved. The file itself can’t be stored, so you’ll select it again later.' : 'You can finish it later from My Achievements.')
      return saved
    } catch (err) {
      toast.error('Couldn’t save the draft', err instanceof Error ? err.message : undefined)
      return null
    }
  }

  // ── Navigation ──
  function goTo(target: number, values = form) {
    // An existing draft keeps up with the student as they move, so progress isn't lost.
    if (draft && !editing) saveDraft(target, true, values)
    setStep(target)
  }

  function next() {
    setAttempted((a) => new Set(a).add(step))
    if (stepErrors.length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-wizard-body] [aria-invalid="true"], [data-wizard-body] input[type="radio"]')?.focus())
      return
    }
    if (returnToReview) {
      setReturnToReview(false)
      goTo(STEP.review)
    } else goTo(step + 1)
  }

  function back() {
    setReturnToReview(false)
    goTo(Math.max(0, step - 1))
  }

  function editFromReview(target: number) {
    setReturnToReview(true)
    goTo(target)
  }

  function skipStep() {
    // Skipping the optional step clears anything half-typed there, so nothing unexpected is submitted.
    const cleared = step === STEP.additional ? { ...form, details: '', prizeDetails: '', evidenceNote: '' } : form
    setForm(cleared)
    goTo(returnToReview ? STEP.review : step + 1, cleared)
    setReturnToReview(false)
  }

  function skipOptionalDetails() {
    setAttempted((a) => new Set(a).add(step))
    if (!form.achievementType || (form.achievementType === 'Other' && !form.position.trim())) return
    // Keep the generated description; leave the optional prize/position as it is.
    const generated = { ...form, descriptionEdited: false, description: '' }
    setForm(generated)
    goTo(returnToReview ? STEP.review : step + 1, generated)
    setReturnToReview(false)
  }

  // ── File ──
  async function chooseFile(file: File | undefined) {
    if (!file) {
      setFileError('No file was selected. Choose a certificate to attach.')
      return
    }
    setFileError(undefined)
    setChecking(true)
    // A short minimum keeps the "checking" state readable; the check itself is local and fast.
    const [result] = await Promise.all([inspectCertificateFile(file), new Promise((r) => setTimeout(r, 450))])
    setChecking(false)
    if (!result.ok) {
      setFileError(result.message)
      return
    }
    uploadId.current = crypto.randomUUID()
    setSelected({ file, type: result.type, objectUrl: URL.createObjectURL(file) })
    setDuplicates([])
  }

  // ── Submit ──
  async function submit(confirmedDuplicates = false) {
    if (inFlight.current) return
    const errors: ValidationError[] = validateForm(form, hasCertificate)
    if (errors.length) {
      setAttempted(new Set([0, 1, 2, 3, 4]))
      setReturnToReview(true)
      setStep(errors[0].step)
      toast.error('Something needs fixing', errors[0].message)
      return
    }
    if (!confirmedDuplicates) {
      const possible = getPossibleDuplicates(student.id, form, editing?.id)
      if (possible.length) {
        setDuplicates(possible)
        requestAnimationFrame(() => document.querySelector('[data-wizard-body] [role="alert"]')?.scrollIntoView({ block: 'center' }))
        return
      }
    }
    inFlight.current = true
    lastConfirmed.current = confirmedDuplicates
    setUploadFailure(null)
    setSubmitting(true)
    try {
      let certificate: CertificateFile | undefined
      if (selected && storageAvailability() === 'ready') {
        // Real storage: the file must reach Google Drive and be recorded BEFORE the achievement is saved.
        // If this throws, nothing is saved and the student can simply press Submit again.
        setStage('uploading')
        const stored = await uploadCertificate({
          achievementId: editing ? editing.id : newAchievementId.current,
          uploadId: uploadId.current,
          category: form.category,
          file: selected.file,
        })
        certificate = { fileName: stored.fileName, fileType: selected.type, sizeBytes: stored.sizeBytes, storage: { provider: 'drive', certificateId: stored.id } }
      } else if (selected) {
        certificate = await storeCertificate(selected.file, selected.type)
      }
      setStage('saving')
      const result = editing
        ? await updateAndRecordEdit(student.id, editing.id, form, { certificate, note })
        : await submitAchievement(student.id, form, certificate, { draftId: draft?.id, achievementId: newAchievementId.current })
      toast.success(
        editing ? 'Changes saved' : 'Certificate submitted',
        editing ? `${result.reference} has been updated.` : `${result.reference} has been added to your passport.`,
      )
      navigate(`/student/achievements/${result.achievement.id}/submitted`, { replace: true })
    } catch (err) {
      if (err instanceof SubmissionError && err.errors.length) {
        setAttempted(new Set([0, 1, 2, 3, 4]))
        setStep(err.errors[0].step)
      }
      if (err instanceof CertificateStorageError) {
        // The record was not saved. Retry reuses the same upload reference, so it can never store the file twice.
        setUploadFailure(err.message)
        toast.error('Certificate not uploaded', 'Nothing was submitted. You can retry from the review step.')
      } else {
        toast.error(editing ? 'Changes not saved' : 'Submission failed', err instanceof Error ? err.message : 'Please try again.')
      }
      setSubmitting(false)
      inFlight.current = false
    }
  }

  // ── Exit ──
  const exitTarget = editing ? `/student/achievements/${editing.id}` : '/student/achievements'
  function requestExit() {
    if (dirty) setExitOpen(true)
    else navigate(exitTarget)
  }

  const reviewCertificate = selected
    ? { fileName: selected.file.name, fileType: selected.type, sizeBytes: selected.file.size }
    : editing?.certificate
  const completed = states.filter((s) => s === 'complete').length
  const remaining = states.filter((s) => s === 'incomplete').length
  const stepProps = { form, set, error }

  return (
    <div className="space-y-7">
      <div>
        <Breadcrumbs
          items={
            editing
              ? [{ label: 'My Achievements', to: '/student/achievements' }, { label: editing.eventName, to: `/student/achievements/${editing.id}` }, { label: 'Edit' }]
              : [{ label: 'Dashboard', to: '/student' }, { label: 'My Achievements', to: '/student/achievements' }, { label: draft ? 'Draft' : 'Add Achievement' }]
          }
        />
        <PageHeader
          kicker={editing ? editing.reference : draft ? 'Draft entry' : 'New entry'}
          title={editing ? 'Edit Achievement' : 'Add Achievement'}
          description={
            editing
              ? 'Correct the details or replace the certificate. Your earlier comments and history stay with the record, and nothing has to be approved.'
              : 'A few short steps to add a page to your passport. Only the essentials are required, and you can save a draft at any point.'
          }
          actions={
            <>
              {!editing && (
                <Button variant="secondary" onClick={() => saveDraft()} disabled={submitting || (!dirty && !!draft)} icon={<Save className="size-4" aria-hidden />}>
                  {draft && !dirty ? 'Draft saved' : 'Save Draft'}
                </Button>
              )}
              <Button variant="ghost" onClick={requestExit} disabled={submitting} icon={<LogOut className="size-4" aria-hidden />}>
                Exit
              </Button>
            </>
          }
        />
      </div>

      {initialDraft && (
        <p className="flex items-start gap-2.5 rounded-md border border-lavender-200 bg-lavender-50 px-4 py-3 text-[13px] text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-lavender-700" aria-hidden />
          <span>
            Draft restored from {formatRelative(initialDraft.updatedAt)}. You’re back on step {step + 1}, “{WIZARD_STEPS[step]}”.
            {initialDraft.certificate && !selected && ' The certificate file wasn’t kept — you’ll be asked to select it again.'}
          </span>
        </p>
      )}

      <Stepper step={step} states={states} onJump={(s) => { setReturnToReview(false); goTo(s) }} />

      <div className="grid gap-8 lg:grid-cols-[1fr_270px]">
        <section className="paper min-w-0 p-5 sm:p-8" aria-labelledby="wizard-step-title" data-wizard-body>
          <p className="label-archival">
            Step {step + 1} of {WIZARD_STEPS.length}
            {OPTIONAL_STEPS.includes(step) && ' · optional'}
          </p>
          <h2 id="wizard-step-title" ref={headingRef} tabIndex={-1} className="mt-1.5 font-serif text-[18px] leading-snug text-navy-900 focus:outline-none">
            {isReview && editing ? 'Review before you editing' : STEP_TITLES[step]}
          </h2>
          <p className="mt-1 mb-7 text-sm text-ink-muted">{STEP_GUIDANCE[step]}</p>

          {step === STEP.category && <CategoryStep {...stepProps} />}
          {step === STEP.event && <EventStep {...stepProps} />}
          {step === STEP.result && <ResultStep {...stepProps} />}
          {step === STEP.additional && <AdditionalStep {...stepProps} />}
          {step === STEP.certificate && (
            <UploadStep
              selected={selected}
              checking={checking}
              error={fileError ?? error('certificate')}
              onChoose={chooseFile}
              onRemove={() => {
                setSelected(null)
                setFileError(undefined)
              }}
              eventName={form.eventName}
              existing={editing?.certificate}
              missingFromDraft={lastSavedMissingFile}
              storage={storageAvailability()}
            />
          )}
          {isReview &&
            (reviewCertificate ? (
              <ReviewStep
                student={student}
                form={form}
                certificate={reviewCertificate}
                objectUrl={selected?.objectUrl}
                onEdit={editFromReview}
                duplicates={duplicates}
                onConfirmDuplicates={() => submit(true)}
                submitting={submitting}
                resubmitting={!!editing}
                note={note}
                onNoteChange={setNote}
              />
            ) : (
              <div role="alert" className="rounded-md border border-terracotta-300 bg-terracotta-50 p-4 text-sm">
                <p className="font-medium text-navy-900">A certificate file is needed before you can review.</p>
                <p className="mt-1 text-ink-soft">Files aren’t kept between visits, so please select it again.</p>
                <Button size="sm" className="mt-3" onClick={() => editFromReview(STEP.certificate)}>
                  Select certificate
                </Button>
              </div>
            ))}

          {isReview && uploadFailure && <UploadFailureNotice message={uploadFailure} retrying={submitting} onRetry={() => submit(lastConfirmed.current)} />}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="ghost" onClick={back} disabled={step === 0 || submitting} icon={<ArrowLeft className="size-4" aria-hidden />}>
              Back
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              {step === STEP.result && (
                <Button variant="secondary" onClick={skipOptionalDetails}>
                  Skip optional details
                </Button>
              )}
              {step === STEP.additional && (
                <Button variant="secondary" onClick={skipStep}>
                  Skip This Step
                </Button>
              )}
              {isReview ? (
                <Button
                  variant="accent"
                  onClick={() => submit(false)}
                  loading={submitting}
                  disabled={!reviewCertificate || duplicates.length > 0}
                  icon={editing ? <Send className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
                >
                  {submitting ? (stage === 'uploading' ? 'Uploading certificate…' : 'Submitting…') : editing ? 'Resubmit Certificate' : 'Submit Certificate'}
                </Button>
              ) : (
                <Button onClick={next} disabled={checking} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  {returnToReview ? 'Back to review' : step === STEP.certificate ? 'Review' : 'Continue'}
                </Button>
              )}
            </div>
          </div>
        </section>

        <aside className="self-start rounded-xl border border-line bg-white p-5" aria-label="Progress summary">
          <p className="label-archival text-[10px]">Your progress</p>
          <p className="mt-2 font-serif text-[15px] leading-snug text-navy-900">{form.eventName.trim() || <span className="text-ink-muted/70 italic">Untitled entry</span>}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {completed} of 5 sections done · {remaining} remaining
          </p>
          <ol className="mt-4 space-y-2 text-[13px]">
            {states.map((state, i) => (
              <li key={WIZARD_STEPS[i]} className="flex items-center gap-2.5">
                {state === 'complete' ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-sky-200 text-sky-700">
                    <Check className="size-2.5" strokeWidth={3} aria-hidden />
                  </span>
                ) : (
                  <CircleDashed className={cn('size-4', i === step ? 'text-gold-dark' : 'text-line-strong')} aria-hidden />
                )}
                <span className={cn(i === step ? 'font-medium text-navy-900' : state === 'complete' ? 'text-ink-soft' : 'text-ink-muted')}>{WIZARD_STEPS[i]}</span>
                <span className="ml-auto text-[11.5px] text-ink-muted">{state === 'complete' ? 'Done' : state === 'optional-empty' ? 'Optional' : 'To do'}</span>
              </li>
            ))}
          </ol>
          {!editing && (
            <p className="mt-5 border-t border-line pt-3 text-[12px] text-ink-muted">
              {draft ? (dirty ? 'Unsaved changes since the last draft save.' : `Draft saved ${formatRelative(draft.updatedAt)}.`) : 'Not saved yet. Use Save Draft to finish later.'}
            </p>
          )}
        </aside>
      </div>

      <Dialog
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        size="sm"
        title="Leave without finishing?"
        description={editing ? 'Your changes haven’t been resubmitted.' : 'You have unsaved changes.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExitOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setExitOpen(false)
                navigate(exitTarget)
              }}
            >
              Discard changes
            </Button>
            {!editing && (
              <Button
                onClick={() => {
                  if (saveDraft()) {
                    setExitOpen(false)
                    navigate(exitTarget)
                  }
                }}
              >
                Save draft and exit
              </Button>
            )}
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {editing
            ? 'If you leave now, the achievement stays as it was and still needs your attention.'
            : draft
              ? 'Save to update your draft, or discard to keep the draft as it was last saved.'
              : 'Save a draft to finish later, or discard what you’ve entered.'}
        </p>
      </Dialog>
    </div>
  )
}

function Stepper({ step, states, onJump }: { step: number; states: ReturnType<typeof stepStates>; onJump: (s: number) => void }) {
  return (
    <nav aria-label="Submission steps">
      <p className="mb-3 text-sm text-ink-muted md:hidden">
        Step {step + 1} of {WIZARD_STEPS.length} · <span className="text-navy-900">{WIZARD_STEPS[step]}</span>
      </p>
      <ol className="grid grid-cols-6 gap-1.5 md:gap-3">
        {WIZARD_STEPS.map((label, i) => {
          const current = i === step
          // Earlier steps are always reachable; later ones only once everything before them is filled in.
          const reachable = i <= step || states.slice(0, i).every((s) => s !== 'incomplete')
          const complete = i < STEP.review ? states[i] === 'complete' && !current : false
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => !current && reachable && onJump(i)}
                disabled={current || !reachable}
                aria-current={current ? 'step' : undefined}
                className="group flex w-full flex-col gap-2 text-left disabled:cursor-default"
              >
                <span className={cn('h-[3px] w-full rounded-full', current ? 'bg-lavender-500' : complete ? 'bg-sky-500' : 'bg-line')} />
                <span className="hidden items-center gap-2 md:flex">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]',
                      current ? 'bg-lavender-200 text-lavender-700' : complete ? 'bg-sky-200 text-sky-700' : 'border border-line-strong text-ink-muted',
                    )}
                  >
                    {complete ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={cn('truncate text-[13px]', current ? 'font-medium text-navy-900' : 'text-ink-muted', !current && reachable && 'group-hover:text-navy-900 group-hover:underline')}>
                    {label}
                  </span>
                </span>
                <span className="sr-only md:hidden">
                  {label} {current ? '(current step)' : complete ? '(done)' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
