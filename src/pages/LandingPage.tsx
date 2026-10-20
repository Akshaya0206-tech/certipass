import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Building2,
  ChevronDown,
  FileCheck2,
  FileSearch,
  FileUp,
  Filter,
  History,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Stamp,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { ButtonLink } from '../components/ui/Button'
import { cn } from '../lib/cn'

type Feature = [icon: LucideIcon, title: string, body: string]

const NAV_LINKS = [
  { href: '#top', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#students', label: 'For Students' },
  { href: '#faculty', label: 'For Faculty' },
]

const SIGN_IN_LINKS = [
  { to: '/login', label: 'Student', note: 'Your achievement passport' },
  { to: '/faculty/login', label: 'Faculty', note: 'Review desk' },
  { to: '/admin/login', label: 'Administrator', note: 'Records office' },
]

function SignInMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex h-10 items-center gap-1 rounded-[5px] px-3 text-sm font-medium text-navy-900 hover:bg-parchment"
      >
        Sign In
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 animate-slide-up rounded-md border border-line bg-white p-1.5 shadow-lift">
          <p className="label-archival px-3 pt-2 pb-1.5 text-[10px]">Sign in as</p>
          {SIGN_IN_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="flex flex-col rounded px-3 py-2 hover:bg-parchment" onClick={() => setOpen(false)}>
              <span className="text-sm font-medium text-navy-900">{l.label}</span>
              <span className="text-[12px] text-ink-muted">{l.note}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-ivory/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 md:px-8">
        <a href="#top" aria-label="CertiPass home">
          <Logo />
        </a>
        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded px-3 py-2 text-sm text-ink-soft hover:text-navy-900">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <SignInMenu />
          <ButtonLink to="/register" variant="primary">
            Get Started
          </ButtonLink>
        </div>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded text-navy-900 hover:bg-parchment lg:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </div>
      {menuOpen && (
        <div id="site-menu" className="animate-fade-in border-t border-line bg-ivory px-5 pt-3 pb-6 lg:hidden">
          <nav aria-label="Primary mobile">
            <ul className="divide-y divide-line">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setMenuOpen(false)} className="block py-3 text-[15px] text-navy-900">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="label-archival mt-5 mb-2">Sign in</p>
          <div className="grid grid-cols-3 gap-2">
            {SIGN_IN_LINKS.map((l) => (
              <ButtonLink key={l.to} to={l.to} variant="secondary" size="sm">
                {l.label}
              </ButtonLink>
            ))}
          </div>
          <ButtonLink to="/register" className="mt-3 w-full">
            Get Started
          </ButtonLink>
        </div>
      )}
    </header>
  )
}

/** Hero illustration: an open achievement journal with a certificate tucked in. */
function JournalComposition() {
  const entries = [
    { y: '2026', m: 'Aug', t: 'Best Paper — Applied Computing', won: true },
    { y: '2025', m: 'Nov', t: 'Runner-up, Programming Contest', won: false },
    { y: '2025', m: 'Feb', t: 'Conference on Responsible AI', won: false },
    { y: '2024', m: 'Oct', t: 'Quiz — First place', won: true },
  ] as const
  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none" aria-hidden>
      {/* passport cover behind */}
      <div className="absolute top-6 -left-2 h-[86%] w-[78%] -rotate-[4deg] rounded-md bg-navy-900 shadow-lift sm:-left-6">
        <div className="absolute inset-3 rounded-sm border border-ivory/15" />
        <p className="absolute bottom-8 left-4 rotate-180 font-mono text-[9px] tracking-[0.3em] text-ivory/45 uppercase [writing-mode:vertical-rl]">
          Achievement passport · No. 0417
        </p>
      </div>

      {/* journal page */}
      <div className="ruled relative ml-auto w-[86%] rounded-md border border-line-strong bg-[#fffdf7] px-6 pt-6 pb-7 shadow-lift sm:px-8">
        <div className="flex items-baseline justify-between">
          <p className="label-archival text-[10px]">Record of achievement</p>
          <p className="font-mono text-[10px] text-ink-muted">p. 12</p>
        </div>
        <p className="mt-3 font-serif text-[22px] leading-tight text-navy-900">Aarav Menon</p>
        <p className="text-[12px] text-ink-muted">CSE · Year III · Section B</p>

        <ol className="relative mt-6 space-y-[18px] border-l border-line-strong pl-5">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              <span
                className={cn(
                  'absolute top-[6px] -left-[24.5px] size-2 rounded-full ring-4 ring-[#fffdf7]',
                  e.won ? 'bg-navy-800' : 'bg-lavender-500',
                )}
              />
              <p className="font-mono text-[10px] tracking-wider text-ink-muted uppercase">
                {e.m} {e.y}
              </p>
              <p className="text-[13.5px] text-ink">{e.t}</p>
            </li>
          ))}
        </ol>

        {/* stamp */}
        <div className="absolute right-6 bottom-8 flex size-[84px] rotate-[-14deg] flex-col items-center justify-center rounded-full border-2 border-terracotta-500/70 text-terracotta-600/85">
          <span className="font-mono text-[8px] tracking-[0.2em] uppercase">On record</span>
          <Stamp className="my-0.5 size-5" strokeWidth={1.5} />
          <span className="font-mono text-[8px] tracking-[0.2em]">2025</span>
        </div>
      </div>

      {/* tucked certificate */}
      <div className="absolute -top-5 right-2 w-[46%] rotate-[6deg] rounded-sm border border-line bg-white p-2 shadow-lift sm:-right-4">
        <div className="border border-navy-900/40 px-3 py-3 text-center">
          <p className="font-mono text-[7px] tracking-[0.2em] text-ink-muted uppercase">Certificate of</p>
          <p className="font-serif text-[13px] text-navy-900 italic">Achievement</p>
          <div className="mx-auto mt-2 h-px w-3/4 bg-line-strong" />
          <div className="mx-auto mt-1.5 h-px w-1/2 bg-line" />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-[6.5px] text-ink-muted">CP-2026-0142</span>
            <span className="size-3.5 rounded-full bg-terracotta-500" />
          </div>
        </div>
      </div>

    </div>
  )
}

function SectionKicker({ n, children, inverse }: { n: string; children: string; inverse?: boolean }) {
  return (
    <p className={cn('label-archival flex items-center gap-3', inverse && 'text-ivory/55')}>
      <span className={cn('font-serif text-[13px] tracking-normal normal-case italic', inverse ? 'text-terracotta-300' : 'text-terracotta-600')}>§ {n}</span>
      <span className={cn('h-px w-8', inverse ? 'bg-ivory/25' : 'bg-line-strong')} />
      {children}
    </p>
  )
}

const STEPS = [
  {
    n: 'I',
    title: 'Submit',
    body: 'Choose a category, add the event details and attach the certificate as a PDF, JPG or PNG. A short description is assembled for you.',
    icon: FileUp,
  },
  {
    n: 'II',
    title: 'Record',
    body: 'The achievement joins your passport straight away — with its event, organiser, date and the result you won. Nothing to wait for.',
    icon: FileCheck2,
  },
  {
    n: 'III',
    title: 'Showcase',
    body: 'Your entries build a chronological record — ready to reference for placements, scholarships and applications, and for your department’s reports.',
    icon: Award,
  },
]

export default function LandingPage() {
  const { signedOutByUser, acknowledgeSignOut } = useAuth()
  // Arriving here after logout completes the sign-out redirect.
  useEffect(() => {
    if (signedOutByUser) acknowledgeSignOut()
  }, [signedOutByUser, acknowledgeSignOut])

  return (
    <div id="top" className="min-h-dvh bg-ivory">
      <a href="#hero" className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <SiteHeader />

      <main>
        {/* ——— Hero ——— */}
        <section id="hero" className="relative overflow-hidden">
          <div className="mx-auto grid max-w-[1240px] gap-14 px-5 pt-14 pb-20 md:px-8 lg:grid-cols-12 lg:gap-8 lg:pt-20 lg:pb-28">
            <div className="lg:col-span-7 lg:pr-10">
              <SectionKicker n="01">The digital achievement journal</SectionKicker>
              <h1 className="display mt-6 text-[44px] leading-[1.02] sm:text-[60px] lg:text-[72px]">
                Your Achievements.
                <br />
                <span className="text-navy-700 italic">Organized</span> for <span className="relative whitespace-nowrap">What’s Next.<svg viewBox="0 0 300 12" className="absolute -bottom-2 left-0 h-3 w-full text-terracotta-500" preserveAspectRatio="none" aria-hidden><path d="M2 8c60-6 140-7 296-2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></span>
              </h1>
              <p className="mt-8 max-w-[520px] text-[17px] leading-relaxed text-ink-soft">
                Upload, organise and showcase your certificates in one place. Build a complete record of your academic, technical and extracurricular achievements.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ButtonLink to="/register" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Get Started
                </ButtonLink>
                <a href="#features" className="inline-flex h-12 items-center gap-2 px-3 text-[15px] font-medium text-navy-900 underline decoration-line-strong decoration-1 underline-offset-[6px] hover:decoration-navy-900">
                  Explore Features
                </a>
              </div>
              <dl className="mt-14 grid max-w-[520px] grid-cols-3 border-t border-line pt-5 text-[13px]">
                {[
                  ['Formats', 'PDF · JPG · PNG'],
                  ['Roles', 'Student · Faculty · Admin'],
                  ['Record', 'Grouped by year'],
                ].map(([k, v]) => (
                  <div key={k} className="pr-3">
                    <dt className="label-archival text-[10px]">{k}</dt>
                    <dd className="mt-1 text-ink-soft">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex items-center lg:col-span-5">
              <JournalComposition />
            </div>
          </div>

          {/* timeline ribbon */}
          <div className="border-y border-line bg-parchment/70">
            <div className="mx-auto flex max-w-[1240px] items-center gap-6 overflow-x-auto px-5 py-4 md:px-8" aria-label="Example timeline">
              <span className="label-archival shrink-0 text-[10px]">A student’s record, year by year</span>
              {['2024 · First-year quiz', '2025 · Programming contest', '2025 · Conference', '2026 · Best paper', '2026 · Internship'].map((t, i) => (
                <span key={t} className="flex shrink-0 items-center gap-3 text-[13px] text-ink-soft">
                  <span className={cn('size-1.5 rounded-full', i === 3 ? 'bg-terracotta-500' : 'bg-navy-700')} aria-hidden />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ——— Platform introduction ——— */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 md:px-8 lg:grid-cols-12 lg:py-28">
            <div className="lg:col-span-5">
              <SectionKicker n="02">The platform</SectionKicker>
              <p className="display mt-6 text-[30px] leading-[1.15] md:text-[38px]">
                Certificates tend to scatter — across inboxes, folders and drawers. CertiPass keeps them <em className="text-navy-700">in one bound record.</em>
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:col-span-6 lg:col-start-7 lg:pt-14">
              <div>
                <p className="font-mono text-[11px] text-terracotta-600">01</p>
                <h3 className="mt-2 font-serif text-lg text-navy-900">One place for every certificate</h3>
                <p className="mt-2 text-[14.5px] text-ink-soft">Hackathons, workshops, internships, papers, sports and cultural events, each filed with its organiser, date and result.</p>
              </div>
              <div>
                <p className="font-mono text-[11px] text-terracotta-600">02</p>
                <h3 className="mt-2 font-serif text-lg text-navy-900">A record you can point to</h3>
                <p className="mt-2 text-[14.5px] text-ink-soft">Every submission keeps its reference, its date and the result you won, and every edit stays in the record’s history.</p>
              </div>
              <div>
                <p className="font-mono text-[11px] text-terracotta-600">03</p>
                <h3 className="mt-2 font-serif text-lg text-navy-900">A conversation, not a black box</h3>
                <p className="mt-2 text-[14.5px] text-ink-soft">Faculty can ask a question directly on a record, and you can answer in the same thread.</p>
              </div>
              <div>
                <p className="font-mono text-[11px] text-terracotta-600">04</p>
                <h3 className="mt-2 font-serif text-lg text-navy-900">An institutional view</h3>
                <p className="mt-2 text-[14.5px] text-ink-soft">Administrators see records across departments and batches, manage users and follow what is being achieved.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ——— How it works ——— */}
        <section id="how-it-works" className="scroll-mt-16 border-t border-line bg-parchment/50">
          <div className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 lg:py-24">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <SectionKicker n="03">How it works</SectionKicker>
                <h2 className="display mt-5 text-[34px] md:text-[42px]">Submit. Record. Showcase.</h2>
              </div>
              <p className="max-w-sm text-ink-soft">Three steps from a certificate on your desk to an entry in your record.</p>
            </div>
            <ol className="relative mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
              <span className="absolute top-[27px] right-[16%] left-[16%] hidden h-px bg-line-strong md:block" aria-hidden />
              {STEPS.map((s) => {
                const Icon = s.icon
                return (
                  <li key={s.n} className="relative">
                    <div className="flex items-center gap-4">
                      <span className="relative flex size-14 items-center justify-center rounded-full border border-line-strong bg-ivory font-serif text-xl text-navy-900 italic">
                        {s.n}
                      </span>
                      <Icon className="size-5 text-terracotta-600" strokeWidth={1.6} aria-hidden />
                    </div>
                    <h3 className="mt-6 font-serif text-2xl text-navy-900">{s.title}</h3>
                    <p className="mt-2 max-w-xs text-[14.5px] text-ink-soft">{s.body}</p>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* ——— For students ——— */}
        <section id="students" className="scroll-mt-16">
          <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-20 md:px-8 lg:grid-cols-2 lg:py-28">
            <div>
              <SectionKicker n="04">For students</SectionKicker>
              <h2 className="display mt-5 text-[34px] leading-tight md:text-[42px]">Every certificate, in one record.</h2>
              <ul className="mt-8 space-y-5">
                {([
                  [History, 'A timeline of your years', 'Entries are grouped by year, so your record reads like a journal rather than a folder.'],
                  [Filter, 'Find anything quickly', 'Search and filter by category, result or event year.'],
                  [Award, 'Your results, front and centre', 'Winner, runner-up, participant — what you actually achieved is what the record shows.'],
                ] satisfies Feature[]).map(([I, t, b]) => {
                  return (
                    <li key={t} className="flex gap-4">
                      <I className="mt-0.5 size-5 shrink-0 text-navy-700" strokeWidth={1.6} aria-hidden />
                      <div>
                        <h3 className="font-medium text-navy-900">{t}</h3>
                        <p className="mt-0.5 text-[14.5px] text-ink-soft">{b}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="paper p-1.5" aria-hidden>
              <div className="rounded border border-line bg-white">
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <p className="font-serif text-navy-900">Recent achievements</p>
                  <p className="label-archival text-[9.5px]">Illustration</p>
                </div>
                {[
                  ['CodeHarbour 36-Hour Hackathon', 'Hackathon · First place', 'Winner', 'bg-navy-50 text-navy-800 border-navy-700/25'],
                  ['Symposium on Applied Computing', 'Paper Presentation', 'Best Paper', 'bg-butter-50 text-butter-700 border-butter-200'],
                  ['Programming Contest', 'Competition · Second place', 'Runner-up', 'bg-lavender-100 text-lavender-700 border-lavender-300'],
                  ['Summer Research Internship', 'Internship', 'Participant', 'bg-sky-50 text-sky-700 border-sky-200'],
                ].map(([t, m, s, c]) => (
                  <div key={t} className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-navy-900">{t}</p>
                      <p className="text-[12px] text-ink-muted">{m}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11.5px] font-medium', c)}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ——— For faculty ——— */}
        <section id="faculty" className="scroll-mt-16 bg-navy-900 text-ivory">
          <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-20 md:px-8 lg:grid-cols-12 lg:py-28">
            <div className="order-2 lg:order-1 lg:col-span-6" aria-hidden>
              <div className="rounded-md border border-ivory/10 bg-navy-800/60 p-6">
                <p className="label-archival text-[10px] text-ivory/45">Batch 2023–2027 · CSE</p>
                <p className="mt-2 font-serif text-xl">Batch achievements</p>
                <div className="mt-5 space-y-3 border-l border-ivory/15 pl-4 text-[13.5px]">
                  {[
                    ['Winners', '14'],
                    ['Runners-up', '9'],
                    ['Participants', '38'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4">
                      <p className="text-ivory/50">{k}</p>
                      <p className="font-serif text-lg text-ivory/90 tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex gap-2">
                  <span className="rounded-[5px] border border-ivory/20 px-3 py-1.5 text-[12.5px] text-ivory/80">All achievements</span>
                  <span className="rounded-[5px] bg-terracotta-500 px-3 py-1.5 text-[12.5px] text-white">Download report</span>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2 lg:col-span-5 lg:col-start-8">
              <SectionKicker n="05" inverse>
                For faculty
              </SectionKicker>
              <h2 className="mt-5 font-serif text-[34px] leading-tight md:text-[42px]">Your department’s record, at hand.</h2>
              <ul className="mt-8 space-y-5 text-[14.5px]">
                {([
                  [FileSearch, 'Batch by batch', 'Every batch’s winners, runners-up and participants in one compact table, searchable by student, event or category.'],
                  [MessageSquareText, 'Comments on the record', 'Ask a student about an entry and keep the exchange attached to it.'],
                  [ShieldCheck, 'Reports in a click', 'Filter by batch, department, category, result or date range, then download the department report as CSV.'],
                ] satisfies Feature[]).map(([I, t, b]) => {
                  return (
                    <li key={t} className="flex gap-4">
                      <I className="mt-0.5 size-5 shrink-0 text-lavender-300" strokeWidth={1.6} aria-hidden />
                      <div>
                        <h3 className="font-medium text-ivory">{t}</h3>
                        <p className="mt-0.5 text-ivory/65">{b}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* ——— Administration ——— */}
        <section id="administration" className="scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 lg:py-24">
            <SectionKicker n="06">For administrators</SectionKicker>
            <div className="mt-5 grid gap-10 lg:grid-cols-12">
              <h2 className="display text-[32px] leading-tight md:text-[40px] lg:col-span-4">The institution’s record, in view.</h2>
              <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:col-span-8">
                {([
                  [Users, 'User management', 'Search students and faculty, filter by role and department, and activate or deactivate accounts.'],
                  [Building2, 'Departments', 'See records and verification progress department by department.'],
                  [FileSearch, 'Certificate records', 'One searchable register of every submission and its current status.'],
                  [History, 'Analytics', 'Submissions by category, monthly trends and status distribution — each with a stated calculation.'],
                ] satisfies Feature[]).map(([I, t, b]) => {
                  return (
                    <div key={t} className="bg-ivory p-6">
                      <dt className="flex items-center gap-2.5 font-medium text-navy-900">
                        <I className="size-[18px] text-terracotta-600" strokeWidth={1.6} aria-hidden />
                        {t}
                      </dt>
                      <dd className="mt-2 text-[14px] text-ink-soft">{b}</dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          </div>
        </section>

        {/* ——— CTA ——— */}
        <section className="ruled border-y border-line bg-parchment">
          <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-8 px-5 py-16 md:flex-row md:items-center md:px-8">
            <div>
              <p className="label-archival">Begin your record</p>
              <h2 className="display mt-3 max-w-xl text-[32px] leading-tight md:text-[40px]">
                Start the first page of your <em>achievement passport.</em>
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="/register" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Create a student account
              </ButtonLink>
              <ButtonLink to="/login" size="lg" variant="secondary">
                Sign In
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-ivory">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="label-archival hidden text-[10px] sm:inline">Prototype</span>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-ink-soft">
              <li><Link to="/login" className="hover:text-navy-900">Student sign in</Link></li>
              <li><Link to="/faculty/login" className="hover:text-navy-900">Faculty sign in</Link></li>
              <li><Link to="/admin/login" className="inline-flex items-center gap-1 hover:text-navy-900">Administration <ArrowUpRight className="size-3" aria-hidden /></Link></li>
            </ul>
          </nav>
          <p className="text-[12.5px] text-ink-muted">© {new Date().getFullYear()} CertiPass. Demonstration data only.</p>
        </div>
      </footer>
    </div>
  )
}
