import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, ShieldAlert, X } from 'lucide-react'
import { Logo, LogoMark } from '../components/Logo'
import { Spinner } from '../components/ui/States'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { INSTITUTION_NAME } from '../data/mockData'
import { useNotifications, useRequiredUser } from '../hooks/useData'
import { cn } from '../lib/cn'
import { initials } from '../lib/format'
import { homePathFor } from '../services/auth'
import { NAVIGATION, ROLE_LABEL } from './navigation'
import type { AccessDeniedState } from './RequireRole'
import type { NavItem } from './navigation'

/** Exact match for `end` items, prefix match otherwise, unless the item defines its own rule. */
function isNavItemActive(item: NavItem, pathname: string) {
  if (item.isActive) return item.isActive(pathname)
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/**
 * Workspace frame shared by all three roles: a white sidebar and top bar
 * around a light grey content area, set on the powder-blue background.
 * On large screens the frame fills the window and the content area scrolls.
 */
export function AppShell() {
  const user = useRequiredUser()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const deniedPath = (location.state as AccessDeniedState | null)?.deniedPath
  const notifications = useNotifications()

  const badges = useMemo(
    () => ({ unreadNotifications: notifications.filter((n) => n.userId === user.id && !n.read).length }),
    [notifications, user.id],
  )

  useEffect(() => {
    setDrawerOpen(false)
    // Each page starts at the top of the content area.
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  // Mobile drawer: focus moves in on open, Tab stays inside, Escape closes, focus returns to the menu button.
  useEffect(() => {
    if (!drawerOpen) return
    const drawer = drawerRef.current
    const menuButton = menuButtonRef.current
    const focusables = () => [...(drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])]
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
      if (e.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      menuButton?.focus()
    }
  }, [drawerOpen])

  function handleLogout() {
    // The guard sends a deliberately signed-out user to the sign-in screen; navigating too keeps it explicit.
    logout()
    navigate('/', { replace: true })
    toast.info('Signed out', 'Your session has ended.')
  }

  const items = NAVIGATION[user.role]

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link to={items[0].to} aria-label="CertiPass — go to dashboard">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-parchment lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-2">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase">{ROLE_LABEL[user.role]}</p>
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const badge = item.badgeKey ? badges[item.badgeKey] : 0
            const isActive = isNavItemActive(item, location.pathname)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors',
                    isActive ? 'bg-lavender-200 font-medium text-ink' : 'text-ink-soft hover:bg-parchment hover:text-ink',
                  )}
                >
                  <Icon className={cn('size-[17px]', isActive ? 'text-lavender-700' : 'text-ink-muted')} strokeWidth={1.8} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className={cn('rounded-full px-1.5 text-[11px] font-semibold text-ink tabular-nums', isActive ? 'bg-white' : 'bg-butter-200')}>
                      {badge}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13.5px] text-ink-soft hover:bg-parchment hover:text-ink"
        >
          <LogOut className="size-[17px] text-ink-muted" strokeWidth={1.8} aria-hidden />
          Logout
        </button>
        <p className="mt-2 px-3 text-[11px] text-ink-muted">Prototype · demonstration data</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-sky lg:h-dvh lg:overflow-hidden lg:p-3">
      <a href="#main" className="sr-only z-[70] rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      <div className="flex min-h-dvh flex-col bg-ivory lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden lg:rounded-[20px] lg:border lg:border-white lg:shadow-frame">
        <aside className="hidden w-[236px] shrink-0 border-r border-line lg:block">{sidebar}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-4 sm:px-6 lg:static lg:h-16 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="-ml-1 flex size-9 items-center justify-center rounded-lg text-ink hover:bg-parchment lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <LogoMark className="size-7 lg:hidden" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">{INSTITUTION_NAME}</p>
              <p className="hidden truncate text-[12px] text-ink-muted sm:block">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <NavLink
              to={`${homePathFor(user.role)}/profile`}
              className={({ isActive }) =>
                cn('flex items-center gap-2.5 rounded-full border py-1 pr-1 pl-1 transition-colors sm:pr-3.5', isActive ? 'border-lavender-300 bg-lavender-50' : 'border-line bg-white hover:bg-parchment')
              }
              aria-label={`Your profile: ${user.fullName}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-200 text-[12px] font-semibold text-sky-700" aria-hidden>
                {initials(user.fullName)}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-[11rem] truncate text-[13px] font-medium text-ink">{user.fullName}</span>
                <span className="block max-w-[11rem] truncate text-[11.5px] text-ink-muted">@{user.username}</span>
              </span>
            </NavLink>
          </div>

          <main id="main" ref={mainRef} className="relative flex-1 lg:overflow-y-auto">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
              {deniedPath && (
                <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-terracotta-100 bg-terracotta-50 px-4 py-3 text-sm">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-terracotta-600" aria-hidden />
                  <p className="flex-1 text-ink-soft">
                    <span className="font-medium text-ink">You don’t have access to that page.</span>{' '}
                    <span className="font-mono text-[12.5px]">{deniedPath}</span> belongs to another role, so you’ve been returned to your dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(location.pathname, { replace: true, state: null })}
                    className="flex size-6 items-center justify-center rounded text-ink-muted hover:bg-terracotta-100"
                    aria-label="Dismiss notice"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              )}
              <Suspense
                fallback={
                  <div className="flex min-h-[40vh] items-center justify-center">
                    <Spinner label="Loading page" />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/40" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div ref={drawerRef} id="mobile-nav" className="absolute inset-y-0 left-0 w-[min(17rem,85vw)] animate-slide-up shadow-lift">
            {sidebar}
          </div>
        </div>
      )}
    </div>
  )
}
