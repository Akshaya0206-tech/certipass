import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CircleAlert, Files, GraduationCap, Inbox, UserCog } from 'lucide-react'
import { ActivityList } from '../components/admin/ActivityList'
import { BarList, ChartFrame, ColumnChart, DepartmentBars, StatusSplit } from '../components/charts/Charts'
import { SectionHeading } from '../components/ui/PageHeader'
import { StatLedger } from '../components/ui/StatLedger'
import { EmptyState } from '../components/ui/States'
import { STATUS_META } from '../components/ui/StatusBadge'
import { INSTITUTION_NAME } from '../data/mockData'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useAchievements, useRequiredUser, useUsers } from '../hooks/useData'
import { getAdminActivity } from '../services/adminService'
import {
  formatRate,
  getAchievementStatusDistribution,
  getAchievementTrends,
  getAdminOverview,
  getCategoryAchievementStats,
  getDepartmentAchievementStats,
  getVerificationRate,
  METRIC_DEFINITIONS,
} from '../services/analyticsService'
import { useStore } from '../services/store'

export default function AdminDashboard() {
  const user = useRequiredUser()
  const users = useUsers()
  const achievements = useAchievements()
  const drafts = useStore((s) => s.drafts)
  const audit = useStore((s) => s.audit)
  const config = useAcademicConfig()

  // Every figure and chart on this page comes from the same records, through the analytics service.
  const overview = useMemo(() => getAdminOverview(users, achievements, drafts), [users, achievements, drafts])
  const statuses = useMemo(() => getAchievementStatusDistribution(achievements), [achievements])
  const categories = useMemo(() => getCategoryAchievementStats(achievements).filter((c) => c.count > 0).sort((a, b) => b.count - a.count), [achievements])
  const departments = useMemo(() => getDepartmentAchievementStats(achievements, users, config.departments), [achievements, users, config])
  const trend = useMemo(() => getAchievementTrends(achievements, 'academic_year'), [achievements])
  const activity = useMemo(() => getAdminActivity({ achievements, users, audit }, { limit: 8 }), [achievements, users, audit])
  const noRecords = overview.totalRecords === 0
  const trendEmpty = trend.buckets.every((b) => b.count === 0)

  return (
    <div className="space-y-6">
      <header className="paper flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="label-archival">Records administration</p>
          <h1 className="display mt-1.5 text-[20px] leading-tight md:text-[22px]">Overview</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {INSTITUTION_NAME} · signed in as {user.fullName}
          </p>
        </div>
        <p className="self-start rounded-full bg-lavender-100 px-2.5 py-1 text-[11.5px] font-medium text-lavender-700 md:self-center">All figures: demonstration data</p>
      </header>

      <div>
        <StatLedger
          caption="Institutional totals"
          items={[
            { label: 'Total Students', value: overview.totalStudents, icon: GraduationCap, note: `${overview.activeStudents} active` },
            { label: 'Total Faculty', value: overview.totalFaculty, icon: UserCog, note: `${overview.activeFaculty} active` },
            { label: 'Achievement Records', value: overview.totalRecords, icon: Files, note: 'submitted, any status' },
            { label: 'Pending Verification', value: overview.pendingVerification, icon: Inbox, tone: 'lavender', note: `${overview.submitted} submitted · ${overview.underReview} under review` },
            { label: 'Verified', value: overview.verified, icon: BadgeCheck, tone: 'navy', note: `${formatRate(getVerificationRate(achievements))} of records` },
            { label: 'Needs Attention', value: overview.needsAttention, icon: CircleAlert, tone: 'terracotta', note: 'waiting on students' },
          ]}
        />
        <details className="mt-2 text-[12.5px] text-ink-muted">
          <summary className="cursor-pointer font-medium text-navy-800 hover:underline">How these figures are counted</summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {(
              [
                ['Total Students', METRIC_DEFINITIONS.totalStudents],
                ['Total Faculty', METRIC_DEFINITIONS.totalFaculty],
                ['Achievement Records', METRIC_DEFINITIONS.totalRecords],
                ['Pending Verification', METRIC_DEFINITIONS.pendingVerification],
                ['Verified', METRIC_DEFINITIONS.verified],
                ['Needs Attention', METRIC_DEFINITIONS.needsAttention],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="inline font-medium text-ink-soft">{k}: </dt>
                <dd className="inline">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2">
            Pending + Verified + Needs Attention = Achievement Records. {overview.draftsInProgress} unfinished {overview.draftsInProgress === 1 ? 'draft is' : 'drafts are'} not counted anywhere on this page.
          </p>
        </details>
      </div>

      <section aria-labelledby="charts-heading">
        <SectionHeading
          id="charts-heading"
          title="At a glance"
          aside={
            <Link to="/admin/analytics" className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">
              Analytics & reports <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartFrame
            title="Status distribution"
            calculation="Share of all submitted records by current status."
            table={{ headers: ['Status', 'Records'], rows: statuses.map((s) => [STATUS_META[s.status].label, s.count]) }}
            emptyMessage={noRecords ? 'No achievement records yet.' : undefined}
          >
            <StatusSplit data={statuses} />
          </ChartFrame>
          <ChartFrame
            title="Submissions this academic year"
            calculation="Records by the month they were first submitted, from 1 June."
            table={{ headers: ['Month', 'Submissions'], rows: trend.buckets.map((b) => [b.label, b.count]) }}
            emptyMessage={trendEmpty ? 'No submissions in this academic year yet.' : undefined}
          >
            <ColumnChart data={trend.buckets} />
          </ChartFrame>
          <ChartFrame
            title="Achievement categories"
            calculation="Records per category, any status. Categories with no records are omitted from the chart."
            table={{ headers: ['Category', 'Records'], rows: getCategoryAchievementStats(achievements).map((c) => [c.category, c.count]) }}
            emptyMessage={noRecords ? 'No achievement records yet.' : undefined}
          >
            <BarList data={categories.map((c) => ({ label: c.category, value: c.count }))} />
          </ChartFrame>
          <ChartFrame
            title="Departments"
            calculation="Records counted under the submitting student’s department; the inner bar is the verified share."
            table={{ headers: ['Department', 'Verified', 'Records'], rows: departments.map((d) => [d.code, d.verified, d.total]) }}
            emptyMessage={noRecords ? 'No achievement records yet.' : undefined}
          >
            <DepartmentBars data={departments} />
          </ChartFrame>
        </div>
      </section>

      <section aria-labelledby="activity-heading">
        <SectionHeading
          id="activity-heading"
          title="Recent activity"
          aside={
            <Link to="/admin/activity" className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">
              All activity <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="paper p-5 sm:p-6">{activity.length ? <ActivityList items={activity} /> : <EmptyState title="No activity yet" body="Submissions, reviews and account changes will be listed here as they happen." className="py-6" />}</div>
      </section>
    </div>
  )
}
