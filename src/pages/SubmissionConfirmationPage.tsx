import { useParams } from 'react-router-dom'
import { Stamp } from 'lucide-react'
import { PassportLoader } from '../components/passport/PassportLoader'
import { ButtonLink } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useStudent } from '../hooks/useData'
import { useMyAchievements } from '../hooks/usePassport'
import { formatDate } from '../lib/format'
import { categoryLabel } from '../services/achievementValidation'
import { getAchievementById } from '../services/passportService'
import { AchievementNotFound } from './AchievementDetailPage'

/**
 * Receipt shown after a submission or resubmission. It reads the stored
 * record, so everything on it (reference, status, dates) is what was actually
 * saved — and it still works after a refresh.
 */
export default function SubmissionConfirmationPage() {
  return (
    <PassportLoader label="Loading confirmation">
      <Confirmation />
    </PassportLoader>
  )
}

function Confirmation() {
  const { id = '' } = useParams()
  const student = useStudent()
  const mine = useMyAchievements()
  const a = getAchievementById(student.id, id, mine)
  if (!a) return <AchievementNotFound />

  const last = a.history.at(-1)
  const resubmitted = last?.kind === 'resubmitted'
  const when = resubmitted ? (last?.at ?? a.updatedAt) : a.submittedAt

  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="text-center">
        <div className="mx-auto flex size-24 rotate-[-10deg] flex-col items-center justify-center rounded-full border-2 border-terracotta-500 text-terracotta-600" aria-hidden>
          <span className="font-mono text-[9px] tracking-[0.2em] uppercase">Received</span>
          <Stamp className="my-0.5 size-6" strokeWidth={1.5} />
          <span className="font-mono text-[9px]">{a.reference.slice(3)}</span>
        </div>
        <p className="label-archival mt-8">{resubmitted ? 'Resubmission successful' : 'Submission successful'}</p>
        <h1 className="display mt-3 text-[23px] leading-tight md:text-[27px]">{resubmitted ? 'Sent back for review.' : 'Filed in your passport.'}</h1>
        <p className="mx-auto mt-3 max-w-lg text-ink-soft">
          {resubmitted
            ? 'Your corrections were saved and the achievement is back in the faculty review queue.'
            : 'Your certificate has been submitted and is waiting for a faculty reviewer.'}{' '}
          You’ll get a notification when its status changes.
        </p>
      </div>

      <dl className="mt-9 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {(
          [
            ['Event', a.eventName],
            ['Category', categoryLabel(a)],
            [resubmitted ? 'Resubmitted on' : 'Submitted on', formatDate(when)],
            ['Reference ID', <span key="ref" className="font-mono text-navy-800">{a.reference}</span>],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="bg-white px-5 py-4">
            <dt className="label-archival text-[10px]">{k}</dt>
            <dd className="mt-1 break-words text-ink">{v}</dd>
          </div>
        ))}
        <div className="bg-white px-5 py-4 sm:col-span-2">
          <dt className="label-archival text-[10px]">Status</dt>
          <dd className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={a.status} />
            <span className="text-[13px] text-ink-muted">
              {a.status === 'submitted' ? 'Not yet verified — a faculty reviewer needs to check it first.' : 'This record has moved on since it was submitted.'}
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to={`/student/achievements/${a.id}`}>View Achievement</ButtonLink>
        <ButtonLink to="/student" variant="secondary">
          Return to Dashboard
        </ButtonLink>
        <ButtonLink to="/student/achievements/new" variant="ghost">
          Add another
        </ButtonLink>
      </div>
      <p className="mt-8 text-center text-[12px] text-ink-muted">
        Prototype note: the certificate file was checked in your browser. It was not uploaded to a server; only its details were recorded.
      </p>
    </div>
  )
}
