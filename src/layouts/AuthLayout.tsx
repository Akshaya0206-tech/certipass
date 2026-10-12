import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
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

/** Sign-in and registration: one centred panel on the powder-blue background. */
export function AuthLayout({ title, subtitle, children, role, wide }: AuthLayoutProps) {
  const { signedOutByUser, acknowledgeSignOut } = useAuth()

  // A deliberate sign-out ends here; clear the flag so the guards behave normally again.
  useEffect(() => {
    if (signedOutByUser) acknowledgeSignOut()
  }, [signedOutByUser, acknowledgeSignOut])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-sky px-4 py-8 sm:py-12">
      <div className={cn('w-full animate-fade-in rounded-2xl border border-white bg-white p-6 shadow-frame sm:p-8', wide ? 'max-w-[620px]' : 'max-w-[420px]')}>
        <Logo />
        <h1 className="display mt-6 text-[22px] leading-tight">{title}</h1>
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
      <p className="mt-5 text-center text-[12px] text-sky-700">Prototype · sign-in is simulated in this browser</p>
    </main>
  )
}
