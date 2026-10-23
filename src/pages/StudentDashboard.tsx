import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Award, CircleAlert, FilePlus2, Files, Medal, Search, UserRound, Users } from 'lucide-react'
import { AchievementList } from '../components/AchievementList'
import { ActivityFeed } from '../components/passport/ActivityFeed'
import { DraftList } from '../components/passport/DraftList'
import { FeaturedAchievement } from '../components/passport/FeaturedAchievement'
import { PassportLoader } from '../components/passport/PassportLoader'
import { DetailList } from '../components/RecordDetails'
import { ButtonLink } from '../components/ui/Button'
import { SectionHeading } from '../components/ui/PageHeader'
import { StatLedger } from '../components/ui/StatLedger'
import { EmptyState } from '../components/ui/States'
import { departmentName } from '../services/academicService'
import { useStudent } from '../hooks/useData'
import { useMyAchievements, useMyDrafts } from '../hooks/usePassport'
import { formatRelative, initials, ordinalYear, YEAR_LABEL } from '../lib/format'
import { sortBySubmittedDesc } from '../services/achievementService'
import { getAchievementSummary, getFeaturedAchievement, getRecentActivity, validateStudentProfile } from '../services/passportService'

const detailHref = (id: string) => `/student/achievements/${id}`

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function StudentDashboard() {
  return (
    <PassportLoader>
      <Dashboard />
    </PassportLoader>
  )
}

function Dashboard() {
  const student = useStudent()
  const navigate = useNavigate()
  const mine = useMyAchievements()
  const drafts = useMyDrafts()
  const [query, setQuery] = useState('')

  // Every figure below is derived from the signed-in student's own records.
  const summary = useMemo(() => getAchievementSummary(student.id, mine), [student.id, mine])
  const activity = useMemo(() => getRecentActivity(student.id, mine, 7), [student.id, mine])
  const featured = useMemo(() => getFeaturedAchievement(student.id, mine), [student.id, mine])
  const recent = useMemo(() => sortBySubmittedDesc(mine).slice(0, 4), [mine])
  const profileIssues = validateStudentProfile(student)
  const dept = { name: departmentName(student.department) }

  function onSearch(e: FormEvent) {
    e.preventDefault()
    navigate(`/student/achievements${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
  }

  return (
    <div className="space-y-6">
      {/* Passport holder */}
      <header className="paper grid gap-5 border-l-4 border-l-gold p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lavender-200 text-[16px] font-semibold text-lavender-700" aria-hidden>
            {initials(student.fullName)}
          </span>
          <div className="min-w-0">
            <p className="label-archival">
              Achievement passport · <span className="text-navy-800">{student.registerNumber}</span>
            </p>
            <h1 className="display mt-1 text-[20px] leading-tight md:text-[22px]">
              {greeting()}, <em>{student.fullName.split(' ')[0]}.</em>
            </h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              <span className="font-medium text-ink-soft">{student.fullName}</span>
              <span className="mx-2 text-line-strong" aria-hidden>|</span>
              {dept.name ?? student.department} · Year {ordinalYear(student.year)} · Section {student.section}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form onSubmit={onSearch} role="search" className="relative">
            <label htmlFor="dash-search" className="sr-only">Search your achievements</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              id="dash-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search achievements…"
              className="h-9 w-full rounded-lg border border-line-strong bg-white pr-3 pl-9 text-[13.5px] focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none sm:w-64"
            />
          </form>
          <ButtonLink to="/student/achievements/new" variant="accent" icon={<FilePlus2 className="size-4" aria-hidden />}>
            Add Achievement
          </ButtonLink>
        </div>
      </header>

      {profileIssues.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-md border border-terracotta-300 bg-terracotta-50 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-terracotta-600" aria-hidden />
          <div>
            <p className="font-medium text-navy-900">Your student profile is incomplete</p>
            <p className="mt-0.5 text-ink-soft">{profileIssues.join(' ')} Please contact the Office of Academic Records to correct it.</p>
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <section aria-labelledby="dash-drafts-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="dash-drafts-heading" className="font-serif text-[15px] text-navy-900">
              {drafts.length === 1 ? 'A draft is waiting to be finished' : `${drafts.length} drafts are waiting to be finished`}
            </h2>
            <p className="hidden text-[12.5px] text-ink-muted sm:block">Drafts aren’t submitted and don’t count in the totals below.</p>
          </div>
          <DraftList drafts={drafts.slice(0, 3)} compact />
          {drafts.length > 3 && (
            <Link to="/student/achievements" className="mt-2 inline-block text-[13px] font-medium text-navy-800 hover:underline">
              See all {drafts.length} drafts
            </Link>
          )}
        </section>
      )}

      <div>
        <StatLedger
          caption="Achievement summary"
          items={[
            { label: 'Total submitted', value: summary.total, icon: Files },
            { label: 'Winner', value: summary.winner, icon: Award, tone: 'navy' },
            { label: 'Runner-up', value: summary.runner_up, icon: Medal, tone: 'lavender' },
            { label: 'Participant', value: summary.participant, icon: Users },
            { label: 'Other', value: summary.other, tone: 'terracotta', note: 'finalist, best paper, other' },
          ]}
        />
        <p className="mt-2 text-[12px] text-ink-muted">
          Each record is counted once by the result you recorded, so Winner + Runner-up + Participant + Other = total. Drafts aren’t counted
          {summary.archived > 0 ? `, and ${summary.archived} archived ${summary.archived === 1 ? 'record is' : 'records are'} left out` : ''}.
        </p>
      </div>

      {mine.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="paper">
            <EmptyState
              title="Your passport is empty"
              body="Add your first certificate — a workshop, a hackathon, a sports meet — and it will appear here straight away."
              action={<ButtonLink to="/student/achievements/new" icon={<FilePlus2 className="size-4" aria-hidden />}>Add your first achievement</ButtonLink>}
            />
          </div>
          <ProfilePanel />
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <section aria-labelledby="activity-heading" className="paper p-5 sm:p-6">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 id="activity-heading" className="font-serif text-[16px] text-navy-900">Recent activity</h2>
                <Link to="/student/notifications" className="text-[13px] font-medium text-navy-800 hover:underline">
                  Notifications
                </Link>
              </div>
              {activity.length ? (
                <ActivityFeed items={activity} hrefFor={detailHref} />
              ) : (
                <p className="text-sm text-ink-muted">No activity yet.</p>
              )}
            </section>
            <div className="space-y-5">
              <FeaturedAchievement achievement={featured} href={featured ? detailHref(featured.id) : undefined} />
              <ProfilePanel />
            </div>
          </div>

          <section aria-labelledby="recent-heading">
            <SectionHeading
              id="recent-heading"
              title="Recently submitted"
              aside={
                <span className="flex items-center gap-4">
                  <Link to="/student/timeline" className="text-sm font-medium text-navy-800 hover:underline">
                    View timeline
                  </Link>
                  <Link to="/student/achievements" className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">
                    All achievements <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </span>
              }
            />
            <div className="paper">
              <AchievementList achievements={recent} hrefFor={(a) => detailHref(a.id)} />
            </div>
            <p className="mt-2 text-[12px] text-ink-muted">Latest submission {formatRelative(recent[0].submittedAt)}.</p>
          </section>
        </>
      )}
    </div>
  )
}

/** Read-only summary of the student's profile; editing happens on the Profile page. */
function ProfilePanel() {
  const student = useStudent()
  const dept = { name: departmentName(student.department) }
  return (
    <section aria-labelledby="holder-heading" className="paper p-5">
      <h2 id="holder-heading" className="label-archival mb-4">Passport holder</h2>
      <DetailList
        rows={[
          ['Name', student.fullName],
          ['Username', `@${student.username}`],
          ['Register no.', <span key="r" className="font-mono">{student.registerNumber}</span>],
          ['Department', dept.name ?? student.department],
          ['Year', YEAR_LABEL[student.year]],
          ['Section', student.section],
        ]}
      />
      <Link to="/student/profile" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-800 hover:underline">
        <UserRound className="size-3.5" aria-hidden /> Open profile
      </Link>
    </section>
  )
}
