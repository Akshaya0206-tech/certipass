import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, ChevronRight, LogOut, Menu, UserRound, X } from 'lucide-react'
import { Logo, LogoMark } from '../components/Logo'
import { useUser, useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useData'
import { cn } from '../lib/cn'
import { formatDateTime, initials } from '../lib/format'
import { markNotificationsRead } from '../services/odService'
import { HOME, NAVIGATION, ROLE_LABEL, breadcrumbsFor } from './navigation'

/** Close a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function NotificationMenu() {
  const [open, setOpen] = useState(false)
  const items = useNotifications()
  const unread = items.filter((n) => !n.read).length
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (open) markNotificationsRead()
          setOpen(!open)
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex size-10 items-center justify-center rounded-md text-purple-dark hover:bg-lavender-deep"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] leading-4 font-bold text-purple-dark">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-white shadow-pop">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-purple-dark">Notifications</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">You have no notifications yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link}
                    onClick={() => {
                      markNotificationsRead()
                      setOpen(false)
                    }}
                    className="block px-4 py-3 hover:bg-lavender"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {!n.read && <span className="size-2 rounded-full bg-gold-dark" aria-label="Unread" />}
                      {n.title}
                    </p>
                    <p className="text-[13px] text-ink-soft">{n.body}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(n.at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const user = useUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex h-10 items-center gap-2 rounded-md pr-2 pl-1 hover:bg-lavender-deep"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-purple text-xs font-semibold text-white">{initials(user.name)}</span>
        <span className="hidden max-w-36 truncate text-sm font-semibold text-purple-dark sm:block">{user.name}</span>
        <ChevronDown className="size-4 text-ink-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-md border border-line bg-white py-1 shadow-pop">
          <div className="border-b border-line px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            <p className="mt-1 text-xs font-semibold text-purple">{ROLE_LABEL[user.role]}</p>
          </div>
          <Link to={`${HOME[user.role]}/profile`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-lavender">
            <UserRound className="size-4 text-ink-muted" aria-hidden /> Profile and settings
          </Link>
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-lavender"
          >
            <LogOut className="size-4 text-ink-muted" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col bg-purple-dark text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <Logo onDark />
      </div>
      <nav aria-label={`${ROLE_LABEL[user.role]} navigation`} className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAVIGATION[user.role].map((item) => {
            const Icon = item.icon
            const forced = item.isActive ? item.isActive(pathname) : undefined
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => {
                    const active = forced ?? isActive
                    return cn(
                      'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      active ? 'bg-white/10 text-white' : 'text-purple-100 hover:bg-white/5 hover:text-white',
                    )
                  }}
                >
                  {({ isActive }) => {
                    const active = forced ?? isActive
                    return (
                      <>
                        {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-gold" aria-hidden />}
                        <Icon className={cn('size-[18px]', active ? 'text-gold' : 'text-purple-300')} aria-hidden />
                        <span aria-current={active ? 'page' : undefined}>{item.label}</span>
                      </>
                    )
                  }}
                </NavLink>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
              className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-purple-100 hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-[18px] text-purple-300" aria-hidden />
              Logout
            </button>
          </li>
        </ul>
      </nav>
    </div>
  )
}

export function AppShell() {
  const user = useUser()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const trail = breadcrumbsFor(pathname, user.role)

  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    if (!drawer) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <div className="print-root min-h-screen">
      <a href="#main" className="no-print sr-only z-50 rounded bg-gold px-3 py-2 font-semibold text-purple-dark focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {drawer && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-purple-dark/60" onClick={() => setDrawer(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">
            <button ref={closeRef} type="button" onClick={() => setDrawer(false)} className="absolute top-3 right-3 z-10 rounded p-1.5 text-white hover:bg-white/10" aria-label="Close navigation">
              <X className="size-5" aria-hidden />
            </button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="print-root lg:pl-64 print:pl-0">
        <div className="no-print bg-gold px-4 py-1 text-center text-xs font-medium text-purple-dark">
          Prototype with demo data. Nothing here is sent to a real college system.
        </div>
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
          <button type="button" onClick={() => setDrawer(true)} className="-ml-2 inline-flex size-10 items-center justify-center rounded-md text-purple-dark hover:bg-lavender-deep lg:hidden" aria-label="Open navigation" aria-expanded={drawer}>
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="lg:hidden">
            <LogoMark className="h-8" />
          </span>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1 truncate text-sm text-ink-muted">
              {trail.map((c, i) => (
                <li key={`${c.label}-${i}`} className={cn('flex items-center gap-1', i < trail.length - 1 && 'hidden sm:flex')}>
                  {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 sm:block" aria-hidden />}
                  {c.to ? (
                    <Link to={c.to} className="hover:text-purple hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="truncate font-semibold text-purple-dark">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <NotificationMenu />
          <ProfileMenu />
        </header>
        <main id="main" className="print-root mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
