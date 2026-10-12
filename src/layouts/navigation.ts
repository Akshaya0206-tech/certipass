import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  FileCheck2,
  FilePlus2,
  GraduationCap,
  History,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Library,
  ListChecks,
  Settings,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '../types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (for index routes). */
  end?: boolean
  badgeKey?: 'unreadNotifications' | 'reviewQueue'
  /** Custom active rule, for sections whose child pages aren't nested under one prefix. */
  isActive?: (pathname: string) => boolean
}

export const NAVIGATION: Record<Role, NavItem[]> = {
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    {
      to: '/student/achievements',
      label: 'My Achievements',
      icon: Library,
      // The library and each achievement's detail/edit pages, but not "Add Achievement".
      isActive: (p) => p === '/student/achievements' || (p.startsWith('/student/achievements/') && !p.startsWith('/student/achievements/new')),
    },
    { to: '/student/achievements/new', label: 'Add Achievement', icon: FilePlus2 },
    { to: '/student/timeline', label: 'Timeline', icon: CalendarDays },
    { to: '/student/notifications', label: 'Notifications', icon: Bell, badgeKey: 'unreadNotifications' },
    { to: '/student/profile', label: 'Profile', icon: UserRound },
    { to: '/student/help', label: 'Help and Support', icon: LifeBuoy },
  ],
  faculty: [
    { to: '/faculty', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/faculty/queue', label: 'Review Queue', icon: Inbox, badgeKey: 'reviewQueue', isActive: (p) => p === '/faculty/queue' || p.startsWith('/faculty/review/') },
    { to: '/faculty/submissions', label: 'All Submissions', icon: ListChecks },
    { to: '/faculty/students', label: 'Students', icon: GraduationCap },
    { to: '/faculty/profile', label: 'Profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'User Management', icon: Users },
    { to: '/admin/faculty', label: 'Faculty Management', icon: UserCog },
    { to: '/admin/academics', label: 'Academic Configuration', icon: Building2 },
    { to: '/admin/records', label: 'Achievement Records', icon: FileCheck2 },
    { to: '/admin/analytics', label: 'Analytics & Reports', icon: BarChart3 },
    { to: '/admin/activity', label: 'Activity', icon: History },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
}

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student passport',
  faculty: 'Faculty review desk',
  admin: 'Records administration',
}
