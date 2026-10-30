export type Role = 'student' | 'faculty' | 'admin'

/**
 * The record lifecycle. Drafts are deliberately not a status — an unfinished
 * submission is a separate AchievementDraft record (see below).
 *  - submitted: saved by the student and immediately available to faculty.
 *  - archived:  retired by an administrator; kept, but out of active lists.
 */
export type RecordStatus = 'submitted' | 'archived'

export const RECORD_STATUSES: RecordStatus[] = ['submitted', 'archived']

export const ACHIEVEMENT_CATEGORIES = [
  'Hackathon',
  'Workshop',
  'Internship',
  'Competition',
  'Conference',
  'Paper Presentation',
  'Sports',
  'Cultural',
  'Other',
] as const
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number]

export const ACHIEVEMENT_TYPES = [
  'Winner',
  'Runner-up',
  'Finalist',
  'Participant',
  'Best Paper',
  'Best Project',
  'Other',
] as const
export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number]

export const EVENT_MODES = ['Offline', 'Online', 'Hybrid'] as const
export type EventMode = (typeof EVENT_MODES)[number]

export type Year = 1 | 2 | 3 | 4

export interface Department {
  code: string
  name: string
  /** Absent means active. Inactive departments stay on existing records but can't be chosen for new ones. */
  active?: boolean
}

/**
 * Academic configuration shared by registration, profiles, the submission
 * wizard and the admin workspace. Stored as one record (id "academic").
 * Study years are fixed at 1–4 by the Year type and are not configurable.
 */
export interface AcademicConfig {
  id: 'academic'
  departments: Department[]
  sections: { name: string; active: boolean }[]
  /** The fixed category list, each of which can be offered or withheld for new submissions. */
  categories: { name: AchievementCategory; active: boolean }[]
}

export type AuditAction =
  | 'faculty_created'
  | 'faculty_password_reset'
  | 'faculty_deleted'
  | 'record_archived'
  | 'record_restored'
  | 'account_activated'
  | 'account_deactivated'
  | 'profile_updated'
  | 'config_changed'
  | 'data_reset'

/** One administrative action, recorded when it happens. Never contains credentials. */
export interface AuditEvent {
  id: string
  at: string
  actorId: string
  actorName: string
  action: AuditAction
  /** The user affected, when the action concerns an account. */
  targetUserId?: string
  /** Short human-readable description, e.g. "Deactivated Prof. Anand Ramesh (@anand.faculty)". */
  summary: string
}

interface BaseUser {
  id: string
  username: string
  fullName: string
  department: string
  createdAt: string
  active: boolean
  /** Registered, and waiting for an administrator to approve the account. Only ever set by the CertiPass server. */
  pending?: boolean
}

export interface StudentUser extends BaseUser {
  role: 'student'
  registerNumber: string
  year: Year
  section: string
}

export interface FacultyUser extends BaseUser {
  role: 'faculty'
  designation: string
  /**
   * Departments whose students' records this member of faculty oversees: it
   * scopes what they can see, nothing more. When absent, they cover only
   * their own department.
   */
  reviewDepartments?: string[]
}

export interface AdminUser extends BaseUser {
  role: 'admin'
  designation: string
}

export type User = StudentUser | FacultyUser | AdminUser

/**
 * Users never carry credentials — those live only in the auth service's
 * credential store. Kept as an alias for readability at call sites.
 */
export type PublicUser = User

export interface LoginCredentials {
  username: string
  password: string
}

/** Minimal, non-sensitive record persisted to simulate a signed-in session. */
export interface AuthSession {
  userId: string
  role: Role
  issuedAt: string
  expiresAt: string
}

/** Fields each role may change on their own profile in the prototype. */
export type StudentProfileUpdate = Partial<Pick<StudentUser, 'fullName' | 'year' | 'section'>>
export type StaffProfileUpdate = Partial<Pick<FacultyUser, 'fullName' | 'designation'>>
export type AdminProfileUpdate = Partial<Pick<AdminUser, 'fullName'>>
export type ProfileUpdate = StudentProfileUpdate | StaffProfileUpdate | AdminProfileUpdate

export type CertificateFileType = 'application/pdf' | 'image/jpeg' | 'image/png'

/**
 * What the app knows about a certificate: metadata only, plus an optional
 * preview source. It never contains the original file.
 */
export interface CertificateFile {
  fileName: string
  fileType: CertificateFileType
  sizeBytes: number
  /** Data URL for small images uploaded in this browser (prototype storage only). */
  previewDataUrl?: string
  /** Bundled demo asset (public/demo-certificates) for seeded records that have one. */
  previewUrl?: string
  /**
   * Present when the real file is in the college's Google Drive. `certificateId`
   * is the storage service's own id for it, not a Drive id or a link: the file
   * can only be fetched through the authenticated storage API.
   */
  storage?: { provider: 'drive'; certificateId: string }
}
export type CertificateFileMetadata = CertificateFile

/**
 *  - general: an ordinary message from the student or a member of faculty
 *  - note:    a note the student attached when they updated the record
 */
export type CommentType = 'general' | 'note'

/** A message on an achievement. Comments are stored on the achievement they belong to. */
export interface RecordComment {
  id: string
  authorId: string
  authorName: string
  authorRole: Role
  body: string
  createdAt: string
  /** Absent on older records, where it means "general". */
  type?: CommentType
}

/**
 * One entry in a record's history.
 *  - submitted: first submission by the student
 *  - updated:   the student edited the record afterwards
 *  - archived / restored: an administrator retired or reinstated the record
 */
export interface RecordEvent {
  /** The record status after this event. */
  status: RecordStatus
  at: string
  byName: string
  kind?: 'submitted' | 'updated' | 'archived' | 'restored'
  /** The status before this event. Absent on the first entry. */
  fromStatus?: RecordStatus
  /** Who acted. Absent on older records (byName is always present). */
  actorId?: string
  actorRole?: Role
  /** A note recorded with the action, when one was given. */
  note?: string
}

export interface Achievement {
  id: string
  /** Human-readable archive reference, e.g. CP-2026-0142. */
  reference: string
  studentId: string
  category: AchievementCategory
  /** Student's own label when category is "Other". */
  customCategory?: string
  eventName: string
  organizer: string
  eventDate: string
  location?: string
  eventMode?: EventMode
  achievementType: AchievementType
  /** Prize, position or award title. For type "Other", the student's description of the result. */
  position?: string
  /** Additional notes. */
  details?: string
  prizeDetails?: string
  /** What the attached certificate shows / other supporting evidence. */
  evidenceNote?: string
  description: string
  certificate: CertificateFile
  status: RecordStatus
  submittedAt: string
  updatedAt: string
  comments: RecordComment[]
  history: RecordEvent[]
}

export type NotificationType = 'welcome' | 'submitted' | 'updated' | 'comment'

/** An in-app notification. `userId` is the only recipient. */
export interface AppNotification {
  id: string
  userId: string
  title: string
  body: string
  createdAt: string
  read: boolean
  achievementId?: string
  tone: 'info' | 'success' | 'attention'
  /** Absent on older records. */
  type?: NotificationType
}

/**
 * Everything the submission wizard collects, as typed by the student.
 * Student identity (name, register number, department…) is NOT part of it —
 * that always comes from the authenticated profile.
 */
export interface AchievementFormData {
  category: AchievementCategory | ''
  customCategory: string
  eventName: string
  organizer: string
  eventDate: string
  location: string
  eventMode: EventMode | ''
  achievementType: AchievementType | ''
  position: string
  description: string
  /** False while the description is the generated one; true once the student edits it. */
  descriptionEdited: boolean
  details: string
  prizeDetails: string
  evidenceNote: string
}

/** An unfinished submission. Private to its student; never visible to faculty or counted as submitted. */
export interface AchievementDraft {
  id: string
  studentId: string
  /** Wizard step (0-based) the student was on when it was saved. */
  step: number
  form: AchievementFormData
  /**
   * Metadata of the file that was selected when the draft was saved. The file
   * itself can't be kept in a draft, so the student must select it again.
   */
  certificate?: Pick<CertificateFile, 'fileName' | 'fileType' | 'sizeBytes'>
  createdAt: string
  updatedAt: string
}

/** A form that has passed validation, plus its certificate: ready to become an Achievement. */
export interface AchievementSubmission {
  form: AchievementFormData & { category: AchievementCategory; achievementType: AchievementType }
  certificate: CertificateFile
}

export type FormField = keyof AchievementFormData | 'certificate'
export interface ValidationError {
  field: FormField
  /** Wizard step (0-based) where the field lives. */
  step: number
  message: string
}

export interface SubmissionResult {
  achievement: Achievement
  reference: string
}

export interface StudentRegistration {
  fullName: string
  username: string
  password: string
  registerNumber: string
  department: string
  year: Year
  section: string
}

export interface AchievementFilters {
  query?: string
  category?: AchievementCategory | 'all'
  status?: RecordStatus | 'all'
  /** Recorded achievement result group, e.g. only winners. */
  result?: string | 'all'
  year?: string | 'all'
}
