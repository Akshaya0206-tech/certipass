import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Files,
  History,
  Inbox,
  LayoutDashboard,
  ScrollText,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '../types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Custom active rule where child pages do not sit under one prefix. */
  isActive?: (pathname: string) => boolean
}

export const HOME: Record<Role, string> = { student: '/student', faculty: '/faculty', admin: '/admin' }

export const NAVIGATION: Record<Role, NavItem[]> = {
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/apply', label: 'Apply for OD', icon: FilePlus2, isActive: (p) => p.startsWith('/student/apply') },
    {
      to: '/student/applications',
      label: 'My Applications',
      icon: Files,
      isActive: (p) => p.startsWith('/student/applications'),
    },
    { to: '/student/passes', label: 'Approved Passes', icon: CheckCircle2, isActive: (p) => p.startsWith('/student/passes') },
    { to: '/student/history', label: 'Application History', icon: History },
    { to: '/student/profile', label: 'Profile', icon: UserRound },
  ],
  faculty: [
    { to: '/faculty', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/faculty/pending', label: 'Pending Applications', icon: Inbox },
    {
      to: '/faculty/applications',
      label: 'All Applications',
      icon: Files,
      // Includes each application's review page.
      isActive: (p) => p.startsWith('/faculty/applications'),
    },
    { to: '/faculty/passes', label: 'Approved Passes', icon: CheckCircle2 },
    { to: '/faculty/reports', label: 'Reports', icon: BarChart3 },
    { to: '/faculty/profile', label: 'Profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Students & Faculty', icon: Users },
    { to: '/admin/passes', label: 'OD Pass Records', icon: ScrollText },
    { to: '/admin/reports', label: 'Reports & History', icon: ClipboardList },
    { to: '/admin/profile', label: 'Profile', icon: UserRound },
  ],
}

export const ROLE_LABEL: Record<Role, string> = { student: 'Student', faculty: 'Faculty', admin: 'Administrator' }

const SEGMENT_LABEL: Record<string, string> = {
  apply: 'Apply for OD',
  applications: 'Applications',
  passes: 'Approved Passes',
  history: 'Application History',
  profile: 'Profile',
  pending: 'Pending Applications',
  reports: 'Reports',
  users: 'Students & Faculty',
  submitted: 'Submitted',
}

/** Breadcrumb trail for the top bar, derived from the path. */
export function breadcrumbsFor(pathname: string, role: Role): Array<{ label: string; to?: string }> {
  const home = { label: ROLE_LABEL[role], to: HOME[role] }
  const parts = pathname.split('/').filter(Boolean).slice(1) // drop the role segment
  if (parts.length === 0) return [{ label: ROLE_LABEL[role] }, { label: role === 'admin' ? 'Overview' : 'Dashboard' }]
  const trail: Array<{ label: string; to?: string }> = [home]
  let acc = HOME[role]
  parts.forEach((p, i) => {
    acc += `/${p}`
    const last = i === parts.length - 1
    const known = SEGMENT_LABEL[p]
    let label = known ?? p
    if (role === 'student' && parts[0] === 'applications' && !known) label = 'Details'
    if (parts[0] === 'passes' && !known && role !== 'admin') label = 'OD Pass'
    if (role !== 'student' && parts[0] === 'applications' && !known) label = 'Review'
    if (parts[0] === 'apply' && p === 'submitted') label = 'Confirmation'
    if (parts[0] === 'apply' && i === 1 && p !== 'submitted') label = 'Edit draft'
    if (role === 'admin' && parts[0] === 'passes') label = 'OD Pass Records'
    if (role === 'admin' && parts[0] === 'reports') label = 'Reports & History'
    trail.push({ label, to: last ? undefined : acc })
  })
  return trail
}
