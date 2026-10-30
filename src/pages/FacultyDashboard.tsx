import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, FileSpreadsheet, Files, GraduationCap, Medal, Users } from 'lucide-react'
import { AchievementAnalytics } from '../components/faculty/AchievementAnalytics'
import { FacultyRecordsTable } from '../components/FacultyRecordsTable'
import { SectionHeading } from '../components/ui/PageHeader'
import { StatLedger } from '../components/ui/StatLedger'
import { batchLabel } from '../domain/batch'
import { departmentName } from '../services/academicService'
import { useFaculty, useFacultyBatches, useFacultyScope, useFacultySummary } from '../hooks/useFacultyRecords'

/**
 * The faculty workspace home: how many records their departments hold, what
 * the students actually achieved, and the most recent submissions.
 *
 * Every figure is a record-tracking figure. There is no queue and no approval
 * progress — a submitted record is already part of the register.
 */
export default function FacultyDashboard() {
  const faculty = useFaculty()
  const scope = useFacultyScope()
  const batches = useFacultyBatches()
  // Counts and the table are built from the same scoped records, so they always agree.
  const summary = useFacultySummary()
  const scopeNames = useMemo(() => scope.map((code) => departmentName(code)), [scope])

  return (
    <div className="space-y-6">
      <header className="paper border-l-4 border-l-gold p-5">
        <p className="label-archival">Faculty records · {scope.join(' · ')}</p>
        <h1 className="display mt-1.5 text-[20px] leading-tight md:text-[22px]">
          {summary.total ? (
            <>
              <em>{summary.total}</em> {summary.total === 1 ? 'achievement is' : 'achievements are'} on record.
            </>
          ) : (
            'No achievements on record yet.'
          )}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-soft">
          Signed in as {faculty.fullName} · {faculty.designation}
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">
          You track achievement records for students in {scopeNames.join(' and ')}
          {batches.length ? ` · ${batches.length} ${batches.length === 1 ? 'batch' : 'batches'}: ${batches.map((b) => batchLabel(b.code)).join(', ')}` : ''}.
        </p>
      </header>

      <div>
        <StatLedger
          caption="Achievement records in your departments"
          items={[
            { label: 'Total Records', value: summary.total, icon: Files, note: `${summary.recent} in the last 30 days` },
            { label: 'Winners', value: summary.winner, icon: Award, tone: 'navy' },
            { label: 'Runners-up', value: summary.runner_up, icon: Medal, tone: 'lavender' },
            { label: 'Participants', value: summary.participant, icon: Users },
            { label: 'Other / Unclassified', value: summary.other, tone: 'terracotta', note: 'finalist, best paper, other' },
            { label: 'Students with Records', value: summary.studentsWithRecords, icon: GraduationCap, note: `of ${summary.students} students` },
          ]}
        />
        <p className="mt-2 text-[12px] text-ink-muted">
          Counted from the {summary.total} submitted {summary.total === 1 ? 'record' : 'records'} in your departments. Each record is counted once by its
          recorded result, so Winners + Runners-up + Participants + Other = Total Records. Students’ drafts are never included
          {summary.archived > 0 ? `, and ${summary.archived} archived ${summary.archived === 1 ? 'record is' : 'records are'} left out` : ''}.
        </p>
      </div>

      <AchievementAnalytics />

      <div className="grid gap-5 2xl:grid-cols-[1fr_280px]">
        <section aria-labelledby="recent-heading" className="min-w-0">
          <SectionHeading
            id="recent-heading"
            title="Recently submitted"
            aside={
              <Link to="/faculty/batches" className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">
                Batch achievements <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <FacultyRecordsTable
            hrefFor={(id) => `/faculty/records/${id}`}
            caption="Recently submitted achievement records"
            defaultSort="newest"
            limit={6}
            emptyTitle="No records yet"
            emptyBody="Achievements submitted by students in your departments appear here straight away."
          />
        </section>

        <aside aria-labelledby="shortcuts-heading" className="space-y-5">
          <div>
            <h2 id="shortcuts-heading" className="label-archival mb-3">
              Go to
            </h2>
            <ul className="space-y-2">
              {[
                { to: '/faculty/batches', label: 'Batch Achievements', note: 'Winners, runners-up, participants', icon: Files },
                { to: '/faculty/students', label: 'Students', note: 'Search and filter your students', icon: GraduationCap },
                { to: '/faculty/reports', label: 'Academic Reports', note: 'Generate the department report', icon: FileSpreadsheet },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <Link to={item.to} className="paper flex items-center gap-3 p-3.5 transition-colors hover:border-navy-700/30">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lavender-200 text-lavender-700" aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-navy-900">{item.label}</span>
                        <span className="block truncate text-[12px] text-ink-muted">{item.note}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>

          {batches.length > 0 && (
            <div>
              <h2 className="label-archival mb-3">Batches</h2>
              <ul className="space-y-1.5">
                {batches.map((b) => (
                  <li key={b.code}>
                    <Link
                      to={`/faculty/batches?batch=${encodeURIComponent(b.code)}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-[13px] hover:border-navy-700/30"
                    >
                      <span className="text-ink-soft">{b.label}</span>
                      <span className="text-[12px] text-ink-muted tabular-nums">
                        {b.students} {b.students === 1 ? 'student' : 'students'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-ink-muted">
            {summary.recent > 0
              ? `${summary.recent} ${summary.recent === 1 ? 'record' : 'records'} submitted in the last 30 days.`
              : 'No submissions in the last 30 days.'}{' '}
            A record appears here as soon as the student submits it — there is nothing to approve.
          </p>
        </aside>
      </div>
    </div>
  )
}
