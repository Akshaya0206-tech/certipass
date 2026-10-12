import { ChevronDown, LifeBuoy } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { STATUS_META, StatusBadge } from '../components/ui/StatusBadge'
import { SUBMISSION_STATUSES } from '../types'
import { MAX_FILE_BYTES, formatBytes } from '../services/fileService'

const FAQ = [
  ['Which files can I upload?', `PDF, JPG and PNG files up to ${formatBytes(MAX_FILE_BYTES)}. Make sure your name and the event date are clearly visible.`],
  ['How long does verification take?', 'It depends on your department’s reviewers. You’ll receive a notification whenever the status changes.'],
  ['A reviewer asked for a correction. What now?', 'Open the record from your dashboard or notifications, read the reviewer’s comment, then choose Edit and Resubmit. You can correct the details, replace the certificate and add a note before sending it back for review.'],
  ['Can I delete a submission?', 'Not in this prototype. Contact your department coordinator if a record was submitted by mistake.'],
  ['Can I save an achievement and finish it later?', 'Yes. Use Save Draft in the Add Achievement form. Drafts are listed in My Achievements and only you can see them. The certificate file isn’t kept in a draft, so you’ll select it again when you come back.'],
  ['I forgot my password.', 'Contact your department’s achievement coordinator or the Office of Academic Records. Account recovery will be provided through an approved recovery process; there is no self-service reset in this prototype.'],
]

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Support" title="Help and Support" description="Answers to common questions about submitting and verifying certificates." />

      <section aria-labelledby="statuses">
        <h2 id="statuses" className="font-serif text-[16px] text-navy-900">What each status means</h2>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {SUBMISSION_STATUSES.map((s) => (
            <div key={s} className="bg-white p-4">
              <dt><StatusBadge status={s} /></dt>
              <dd className="mt-2 text-sm text-ink-soft">{STATUS_META[s].description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="faq">
        <h2 id="faq" className="font-serif text-[16px] text-navy-900">Frequently asked</h2>
        <div className="paper mt-4 divide-y divide-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-navy-900 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-2 text-sm text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <aside className="flex gap-4 rounded-md border border-lavender-200 bg-lavender-50 p-5">
        <LifeBuoy className="size-5 shrink-0 text-lavender-700" aria-hidden />
        <div className="text-sm">
          <p className="font-medium text-navy-900">Still need help?</p>
          <p className="mt-1 text-ink-soft">Speak to your department’s achievement coordinator, or visit the Office of Academic Records during working hours.</p>
        </div>
      </aside>
    </div>
  )
}
