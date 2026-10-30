import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileCheck2, GraduationCap, HardDrive, RefreshCw, UserCheck } from 'lucide-react'
import { formatMonth } from '../../lib/format'
import { getUploadStats, storageErrorMessage } from '../../services/certificateStorage'
import type { UploadStats } from '../../services/certificateStorage'
import { formatBytes } from '../../services/fileService'
import { Button } from '../ui/Button'
import { SectionHeading } from '../ui/PageHeader'
import { ErrorState, Spinner } from '../ui/States'
import { StatLedger } from '../ui/StatLedger'

/** A small bar list: each row's bar is as long as its count is next to the biggest one. */
function Breakdown({ title, rows, empty }: { title: string; rows: { label: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section aria-label={title} className="paper p-4">
      <h3 className="font-serif text-[14px] text-navy-900">{title}</h3>
      {rows.every((r) => r.count === 0) ? (
        <p className="mt-3 text-[13px] text-ink-muted">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="text-[12.5px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-ink-soft">{r.label}</span>
                <span className="tabular-nums font-medium text-ink">{r.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-parchment" aria-hidden>
                <div className="h-full rounded-full bg-navy-800" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Upload statistics for the administrator: how much has been uploaded and by whom, plus anyone waiting for approval. Counts only stored certificates. */
export function UploadStatistics({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; stats: UploadStats } | { status: 'error'; message: string }>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getUploadStats(controller.signal).then(
      (stats) => !controller.signal.aborted && setState({ status: 'ready', stats }),
      (err) => !controller.signal.aborted && setState({ status: 'error', message: storageErrorMessage(err) }),
    )
    return () => controller.abort()
  }, [refreshKey, attempt])

  if (state.status === 'loading') return <Spinner label="Loading upload statistics" />
  if (state.status === 'error') {
    return (
      <ErrorState
        title="Couldn’t load the statistics"
        body={state.message}
        action={
          <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)} icon={<RefreshCw className="size-3.5" aria-hidden />}>
            Try again
          </Button>
        }
      />
    )
  }
  const { stats } = state
  return (
    <section aria-labelledby="stats-heading" className="space-y-4">
      <SectionHeading id="stats-heading" title="Upload statistics" />
      <StatLedger
        caption="Key figures"
        items={[
          { label: 'Certificates stored', value: stats.certificates.total, icon: FileCheck2, note: `${stats.certificates.last7Days} in the last 7 days` },
          { label: 'Students with a certificate', value: stats.certificates.studentsWithCertificates, icon: GraduationCap, tone: 'navy' },
          { label: 'Uploaded in 30 days', value: stats.certificates.last30Days, icon: CalendarDays, tone: 'lavender' },
          { label: 'Storage used', value: formatBytes(stats.certificates.totalBytes), icon: HardDrive },
          // Students sign in as soon as they register, so this only appears if approval has been switched on and someone is waiting.
          ...(stats.pendingApprovals > 0
            ? [
                {
                  label: 'Awaiting approval',
                  value: stats.pendingApprovals,
                  icon: UserCheck,
                  tone: 'terracotta' as const,
                  note: <Link to="/admin/users" className="font-medium text-navy-800 underline underline-offset-2">Review students</Link>,
                },
              ]
            : []),
        ]}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Breakdown title="By category" rows={stats.byCategory.map((r) => ({ label: r.category, count: r.count }))} empty="No certificates yet." />
        <Breakdown title="By department" rows={stats.byDepartment.map((r) => ({ label: r.department, count: r.count }))} empty="No certificates yet." />
        <Breakdown title="Uploads per month" rows={stats.byMonth.map((r) => ({ label: formatMonth(`${r.month}-01`), count: r.count }))} empty="Nothing uploaded in the last 12 months." />
      </div>
    </section>
  )
}
