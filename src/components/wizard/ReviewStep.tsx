import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, ExternalLink, Eye, EyeOff, PenLine } from 'lucide-react'
import { departmentName } from '../../services/academicService'
import { formatDate, YEAR_LABEL } from '../../lib/format'
import { categoryLabel, STEP } from '../../services/achievementValidation'
import { ACCEPTED_TYPES, formatBytes } from '../../services/fileService'
import { resolveDescription } from '../../services/submissionService'
import type { Achievement, AchievementFormData, CertificateFile, StudentUser } from '../../types'
import { CertificatePreview } from '../CertificatePreview'
import { DetailList } from '../RecordDetails'
import { Button } from '../ui/Button'
import { Field, TextArea } from '../ui/FormField'
import { StatusBadge } from '../ui/StatusBadge'

interface ReviewStepProps {
  student: StudentUser
  form: AchievementFormData
  /** The certificate that will be attached: a newly selected file, or the existing one when resubmitting. */
  certificate: Pick<CertificateFile, 'fileName' | 'fileType' | 'sizeBytes'> & Partial<CertificateFile>
  objectUrl?: string
  onEdit: (step: number) => void
  /** Possible duplicates the student hasn't yet chosen to submit past. */
  duplicates: Achievement[]
  onConfirmDuplicates: () => void
  submitting: boolean
  resubmitting?: boolean
  note?: string
  onNoteChange?: (value: string) => void
}

function Section({ title, editLabel, onEdit, children }: { title: string; editLabel?: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-b border-line pb-5 last:border-0 last:pb-0 sm:grid-cols-[200px_1fr] sm:gap-5">
      <div className="flex items-start justify-between gap-3 sm:block">
        <h3 className="label-archival pt-0.5">{title}</h3>
        {editLabel && onEdit && (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-left text-[13px] font-medium whitespace-nowrap text-navy-800 hover:underline sm:mt-2">
            <PenLine className="size-3.5" aria-hidden /> {editLabel}
          </button>
        )}
      </div>
      <div className="min-w-0 text-sm text-ink">{children}</div>
    </section>
  )
}

const dash = (v: string) => v.trim() || '—'

export function ReviewStep({ student, form, certificate, objectUrl, onEdit, duplicates, onConfirmDuplicates, submitting, resubmitting, note, onNoteChange }: ReviewStepProps) {
  const [showPreview, setShowPreview] = useState(false)
  const dept = { name: departmentName(student.department) }

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && (
        <div role="alert" className="rounded-md border border-terracotta-300 bg-terracotta-50/70 p-4">
          <p className="flex items-center gap-2 font-medium text-navy-900">
            <CircleAlert className="size-4 text-terracotta-600" aria-hidden />
            {duplicates.length === 1 ? 'This looks like an achievement you’ve already added' : `This looks like ${duplicates.length} achievements you’ve already added`}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            Same event name, date and category. That can be legitimate — for example two different awards at one event — so you can still submit.
          </p>
          <ul className="mt-3 space-y-2">
            {duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line bg-white px-3 py-2 text-[13px]">
                <span className="font-mono text-[12px] text-ink-muted">{d.reference}</span>
                <span className="text-ink">{d.position ?? d.achievementType}</span>
                <StatusBadge status={d.status} />
                <Link to={`/student/achievements/${d.id}`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-navy-800 hover:underline">
                  Open in new tab <ExternalLink className="size-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onConfirmDuplicates} loading={submitting}>
              It’s a different achievement — submit anyway
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onEdit(STEP.event)} disabled={submitting}>
              Review event details
            </Button>
          </div>
        </div>
      )}

      <Section title="Student">
        <DetailList
          rows={[
            ['Name', student.fullName],
            ['Register number', <span key="r" className="font-mono">{student.registerNumber}</span>],
            ['Department', dept.name ?? student.department],
            ['Year', YEAR_LABEL[student.year]],
            ['Section', student.section],
          ]}
        />
        <p className="mt-2 text-[12px] text-ink-muted">
          From your profile. <Link to="/student/profile" className="underline underline-offset-2 hover:text-navy-900">Something wrong?</Link>
        </p>
      </Section>

      <Section title="Category" editLabel="Edit Category" onEdit={() => onEdit(STEP.category)}>
        {form.category}
        {form.category === 'Other' && form.customCategory.trim() && <span className="text-ink-muted"> · {categoryLabel(form)}</span>}
      </Section>

      <Section title="Event" editLabel="Edit Event Details" onEdit={() => onEdit(STEP.event)}>
        <DetailList
          rows={[
            ['Event name', form.eventName],
            ['Organiser', form.organizer],
            ['Event date', form.eventDate ? formatDate(form.eventDate) : '—'],
            ['Location', dash(form.location)],
            ['Event mode', form.eventMode || '—'],
          ]}
        />
      </Section>

      <Section title="Achievement" editLabel="Edit Achievement Details" onEdit={() => onEdit(STEP.result)}>
        <DetailList
          rows={[
            ['Achievement type', form.achievementType || '—'],
            ['Prize or position', dash(form.position)],
            ['Description', <span key="d" className="italic">{resolveDescription(form) || '—'}</span>],
          ]}
        />
      </Section>

      <Section title="Additional information" editLabel="Edit Additional Information" onEdit={() => onEdit(STEP.additional)}>
        {form.details.trim() || form.prizeDetails.trim() || form.evidenceNote.trim() ? (
          <DetailList
            rows={[
              ['Additional notes', dash(form.details)],
              ['Prize details', dash(form.prizeDetails)],
              ['About the certificate', dash(form.evidenceNote)],
            ]}
          />
        ) : (
          <p className="text-ink-muted">None added — this step is optional.</p>
        )}
      </Section>

      <Section title="Certificate" editLabel="Replace Certificate" onEdit={() => onEdit(STEP.certificate)}>
        <DetailList
          rows={[
            ['File name', <span key="f" className="font-mono text-[13px] break-all">{certificate.fileName}</span>],
            ['File type', ACCEPTED_TYPES[certificate.fileType]],
            ['File size', formatBytes(certificate.sizeBytes)],
          ]}
        />
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          aria-expanded={showPreview}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-800 hover:underline"
        >
          {showPreview ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          {showPreview ? 'Hide preview' : 'Preview certificate'}
        </button>
        {showPreview && (
          <CertificatePreview certificate={certificate as CertificateFile} eventName={form.eventName} objectUrl={objectUrl} showMeta={false} className="mt-3" />
        )}
      </Section>

      {resubmitting && onNoteChange && (
        <Field label="Note to your reviewer" optional hint="Briefly say what you changed. It’s posted as a comment on the achievement.">
          <TextArea value={note ?? ''} onChange={(e) => onNoteChange(e.target.value)} rows={3} maxLength={1000} />
        </Field>
      )}

      <p className="rounded-md bg-parchment/60 px-3 py-2.5 text-[12.5px] text-ink-soft">
        {resubmitting
          ? 'Resubmitting sends this achievement back to faculty as “Submitted”. Earlier comments and history are kept.'
          : 'After you submit, the status will be “Submitted” until a faculty reviewer verifies it.'}
      </p>
    </div>
  )
}
