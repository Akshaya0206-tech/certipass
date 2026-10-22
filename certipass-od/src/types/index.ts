export type Role = 'student' | 'faculty' | 'admin'

export type OdStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type EventType =
  | 'Hackathon'
  | 'Workshop'
  | 'Symposium'
  | 'Conference'
  | 'Technical Event'
  | 'Sports'
  | 'Other'

export const EVENT_TYPES: EventType[] = [
  'Hackathon',
  'Workshop',
  'Symposium',
  'Conference',
  'Technical Event',
  'Sports',
  'Other',
]

export const YEARS = ['I', 'II', 'III', 'IV'] as const
export const SECTIONS = ['A', 'B', 'C', 'D'] as const

export interface Department {
  code: string
  name: string
}

/** What a faculty member may see and do. Enforced in the service layer. */
export interface FacultyPermissions {
  canReview: boolean
  /** "department" limits the queue to the faculty member's own department. */
  scope: 'department' | 'all'
}

export interface User {
  id: string
  role: Role
  username: string
  email: string
  name: string
  department: string // department code
  active: boolean
  phone?: string
  // student only
  registerNo?: string
  year?: (typeof YEARS)[number]
  section?: string
  // faculty / admin only
  designation?: string
  permissions?: FacultyPermissions
  /** SHA-256 hex of salt + password. Demo accounts only. */
  passwordHash: string
  salt: string
}

/** The user shape exposed to the UI — never includes credentials. */
export type PublicUser = Omit<User, 'passwordHash' | 'salt'>

export interface OdDocument {
  id: string
  name: string
  type: string
  size: number
  /** True when the file content is held in this browser (IndexedDB). Seeded demo files have none. */
  hasContent: boolean
}

export type AuditAction =
  | 'created'
  | 'draft_saved'
  | 'submitted'
  | 'edited'
  | 'approved'
  | 'rejected'

export interface AuditEntry {
  id: string
  at: string // ISO
  actorId: string
  actorName: string
  actorRole: Role
  action: AuditAction
  note?: string
}

export interface OdDecision {
  byId: string
  byName: string
  byRole: Role
  at: string
  remarks?: string
}

export interface OdApplication {
  id: string // e.g. OD-2026-0007 (drafts use DRAFT-xxxx until submitted)
  studentId: string
  // Snapshot of verified identity at submission time.
  studentName: string
  registerNo: string
  department: string
  year: string
  section: string
  collegeEmail: string
  // Event
  eventName: string
  eventType: EventType | ''
  organizer: string
  venue: string
  eventStart: string // yyyy-mm-dd
  eventEnd: string
  odFrom: string
  odUntil: string
  reason: string
  link: string
  documents: OdDocument[]
  declaration: boolean
  status: OdStatus
  createdAt: string
  submittedAt?: string
  decision?: OdDecision
  /** Assigned only when the application is genuinely approved. */
  passNumber?: string
  audit: AuditEntry[]
}

export interface Notification {
  id: string
  userId: string
  at: string
  title: string
  body: string
  link: string
  read: boolean
}

export interface AppState {
  version: number
  users: User[]
  applications: OdApplication[]
  notifications: Notification[]
  counters: { application: number; pass: number }
}
