import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DadaLogo, LogoMark } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'
import { loginPathFor } from '../services/auth'
import type { Role } from '../types'

interface AuthLayoutProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  /** Sign-in pages pass their role to show the role switch; registration leaves it out. */
  role?: Role
  wide?: boolean
}

const ROLE_TABS: { role: Role; label: string }[] = [
  { role: 'student', label: 'Student' },
  { role: 'faculty', label: 'Faculty' },
  { role: 'admin', label: 'Administrator' },
]

/**
 * Sign-in and registration: a REC purple brand panel (college and DADA marks, the
 * mascot) beside the form card. The form itself is the same on every page; on small
 * screens the brand panel becomes a compact header above it.
 */
export function AuthLayout({ title, subtitle, children, role, wide }: AuthLayoutProps) {
  const { signedOutByUser, acknowledgeSignOut } = useAuth()

  // A deliberate sign-out ends here; clear the flag so the guards behave normally again.
  useEffect(() => {
    if (signedOutByUser) acknowledgeSignOut()
  }, [signedOutByUser, acknowledgeSignOut])

  return (
    <div
      className={cn(
        'grid min-h-dvh grid-cols-[minmax(0,1fr)]',
        // The registration form is wider, so it gets a bigger share of the screen.
        wide ? 'lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]',
      )}
    >
      {/* Brand panel */}
      <section aria-label="About CertiPass" className="relative flex flex-col overflow-hidden bg-navy-900 text-white lg:sticky lg:top-0 lg:h-dvh">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-gold" aria-hidden />
        <div className="relative z-10 px-6 py-8 sm:px-10 lg:px-14 lg:pt-10 lg:pb-0">
          <div className="flex items-center gap-4">
            <LogoMark className="h-16 w-11" />
            <p className="min-w-0 text-[12.5px] font-semibold tracking-[0.14em] text-sky-200 uppercase">Rajalakshmi Engineering College</p>
            <DadaLogo className="ml-auto h-10 shrink-0 sm:h-16" />
          </div>
          <p className="font-display mt-8 text-3xl leading-tight font-semibold sm:text-4xl lg:text-[2.6rem]">CertiPass</p>
          <p className="mt-3 max-w-md text-base text-sky-200 lg:text-lg">Your achievement passport, kept in one place.</p>
          <div className="mt-5 h-[3px] w-14 bg-gold" aria-hidden />
          <ul className="mt-6 hidden max-w-md space-y-2 text-sm text-sky-200 lg:block">
            <li>Students record certificates and results as they earn them.</li>
            <li>Faculty see the records of their departments and batches.</li>
            <li>Administrators manage accounts, reports and analytics.</li>
          </ul>
        </div>

        {/* The mascot fills the height left under the text, so it never collides with the list. */}
        <div className="relative hidden min-h-[18rem] flex-1 lg:block" aria-hidden>
          <div className="absolute bottom-0 left-1/2 h-3/4 w-3/4 -translate-x-1/2 rounded-t-full bg-navy-800/40" />
          <img
            src="/mascot.webp"
            width={464}
            height={876}
            alt=""
            draggable={false}
            className="absolute bottom-0 left-1/2 h-[calc(100%-2rem)] max-h-[34rem] w-auto -translate-x-1/2 select-none"
          />
        </div>
      </section>

      {/* Form panel */}
      <main className="flex flex-col items-center justify-center bg-sky px-4 py-10 sm:px-8">
        <div className={cn('w-full animate-fade-in rounded-2xl border border-white bg-white p-6 shadow-frame sm:p-8', wide ? 'max-w-[620px]' : 'max-w-[420px]')}>
          <h1 className="display text-[22px] leading-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13.5px] text-ink-muted">{subtitle}</p>}

          {role && (
            <nav aria-label="Sign in as" className="mt-5 grid grid-cols-3 gap-1 rounded-lg bg-parchment p-1">
              {ROLE_TABS.map((t) => (
                <Link
                  key={t.role}
                  to={t.role === 'student' ? '/' : loginPathFor(t.role)}
                  aria-current={t.role === role ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-md text-[13px] font-medium transition-colors',
                    t.role === role ? 'bg-white text-ink shadow-paper ring-1 ring-line' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-[12px] text-ink-muted">Prototype · sign-in is simulated in this browser</p>
      </main>
    </div>
  )
}
