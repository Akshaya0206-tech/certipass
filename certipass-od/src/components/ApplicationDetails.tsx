import { useEffect, useState } from 'react'
import { ExternalLink, FileImage, FileText, Eye } from 'lucide-react'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { Section } from './ui/PageHeader'
import { dayCount, formatBytes, formatDate, formatRange } from '../lib/format'
import { departmentName } from '../data/seed'
import { getFile } from '../services/fileStore'
import type { OdApplication, OdDocument } from '../types'

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children || '—'}</dd>
    </div>
  )
}

export function StudentInfo({ app }: { app: OdApplication }) {
  return (
    <Section title="Student information">
      <dl className="grid gap-4 p-4 sm:grid-cols-2">
        <Item label="Student name">{app.studentName}</Item>
        <Item label="Register number">
          <span className="font-mono">{app.registerNo}</span>
        </Item>
        <Item label="Department">{departmentName(app.department)}</Item>
        <Item label="Year and section">
          {app.year} year · Section {app.section}
        </Item>
        <Item label="College email">{app.collegeEmail}</Item>
      </dl>
    </Section>
  )
}

export function EventInfo({ app }: { app: OdApplication }) {
  const days = dayCount(app.odFrom, app.odUntil)
  return (
    <Section title="Event and OD request">
      <dl className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Item label="Event name">
            <span className="font-semibold">{app.eventName}</span>
          </Item>
        </div>
        <Item label="Event type">{app.eventType}</Item>
        <Item label="Organiser">{app.organizer}</Item>
        <Item label="Venue">{app.venue}</Item>
        <Item label="Event dates">{formatRange(app.eventStart, app.eventEnd)}</Item>
        <Item label="OD requested">
          {formatRange(app.odFrom, app.odUntil)}
          {days > 0 && <span className="text-ink-muted"> ({days} {days === 1 ? 'day' : 'days'})</span>}
        </Item>
        <Item label="Submitted">{formatDate(app.submittedAt)}</Item>
        <div className="sm:col-span-2">
          <Item label="Reason for request">
            <span className="whitespace-pre-line">{app.reason}</span>
          </Item>
        </div>
        {app.link && (
          <div className="sm:col-span-2">
            <Item label="Reference link">
              <a href={app.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-purple underline underline-offset-2">
                {app.link} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            </Item>
          </div>
        )}
      </dl>
    </Section>
  )
}

export function DocumentList({ docs }: { docs: OdDocument[] }) {
  const [open, setOpen] = useState<OdDocument | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    if (open?.hasContent) {
      setState('loading')
      getFile(open.id).then((blob) => {
        if (cancelled) return
        if (!blob) return setState('missing')
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setState('idle')
      })
    } else {
      setState('missing')
    }
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [open])

  return (
    <Section title="Supporting documents">
      {docs.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">No documents were attached.</p>
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              {d.type.startsWith('image/') ? <FileImage className="size-5 text-purple-500" aria-hidden /> : <FileText className="size-5 text-purple-500" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="text-xs text-ink-muted">{formatBytes(d.size)}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setOpen(d)} aria-label={`Preview ${d.name}`}>
                <Eye className="size-4" aria-hidden /> Preview
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!open} title={open?.name ?? 'Document'} onClose={() => setOpen(null)} wide>
        {state === 'loading' && <p className="py-8 text-center text-sm text-ink-muted">Loading preview…</p>}
        {state === 'missing' && (
          <p className="rounded-md border border-line bg-lavender px-4 py-8 text-center text-sm text-ink-soft">
            This is a demo record, so only the file details were stored. Documents uploaded in this browser can be previewed here.
          </p>
        )}
        {state === 'idle' && url && open?.type.startsWith('image/') && <img src={url} alt={`Preview of ${open.name}`} className="mx-auto max-h-[70vh] rounded border border-line" />}
        {state === 'idle' && url && open?.type === 'application/pdf' && <iframe src={url} title={`Preview of ${open.name}`} className="h-[70vh] w-full rounded border border-line" />}
      </Dialog>
    </Section>
  )
}

export function DecisionPanel({ app }: { app: OdApplication }) {
  if (!app.decision) return null
  const ok = app.status === 'approved'
  return (
    <section className={`panel border-l-4 p-4 ${ok ? 'border-l-gold-dark' : 'border-l-red-fg'}`}>
      <p className="kicker">{ok ? 'Approved by' : 'Rejected by'}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{app.decision.byName}</p>
      <p className="text-xs text-ink-muted">{formatDate(app.decision.at)}</p>
      {app.decision.remarks && (
        <div className="mt-3">
          <p className="kicker">{ok ? 'Remarks' : 'Reason'}</p>
          <p className="mt-0.5 text-sm whitespace-pre-line text-ink-soft">{app.decision.remarks}</p>
        </div>
      )}
    </section>
  )
}
