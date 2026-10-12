/*
 * Demonstration dataset for the CertiPass prototype.
 * Every person, organizer and event below is fictional. Nothing here reflects
 * real institutional records, adoption or verification figures.
 */
import { ACHIEVEMENT_CATEGORIES } from '../types'
import type {
  AcademicConfig,
  Achievement,
  AchievementCategory,
  AchievementType,
  AdminUser,
  AppNotification,
  CertificateFileType,
  Department,
  FacultyUser,
  ReviewComment,
  StatusEvent,
  StudentUser,
  SubmissionStatus,
  User,
  Year,
} from '../types'
import { DEMO_ASSETS } from './demoAssets'
import { DEMO_CREDENTIALS } from './seedCredentials'

export const INSTITUTION_NAME = 'Demonstration College of Engineering'

export const DEPARTMENTS: Department[] = [
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'EEE', name: 'Electrical and Electronics Engineering' },
  { code: 'MECH', name: 'Mechanical Engineering' },
  { code: 'AIDS', name: 'Artificial Intelligence and Data Science' },
]

export const SECTIONS = ['A', 'B', 'C', 'D']

/**
 * Seed academic configuration. DEPARTMENTS and SECTIONS above are only the
 * starting values: at runtime, read the current configuration through
 * services/academicService.ts, which administrators can change.
 */
export const SEED_ACADEMIC_CONFIG: AcademicConfig = {
  id: 'academic',
  departments: DEPARTMENTS.map((d) => ({ ...d, active: true })),
  sections: SECTIONS.map((name) => ({ name, active: true })),
  categories: ACHIEVEMENT_CATEGORIES.map((name) => ({ name, active: true })),
}

/** Development-only demo credentials live in seedCredentials.ts (documented in README.md). */
export { DEMO_CREDENTIALS }

type StudentSeed = [id: string, name: string, username: string, reg: string, dept: string, year: Year, section: string]

const studentSeeds: StudentSeed[] = [
  ['stu-01', 'Aarav Menon', DEMO_CREDENTIALS.student.username, '2023CSE0417', 'CSE', 3, 'B'],
  ['stu-02', 'Diya Raghavan', 'diya.r', '2023CSE0422', 'CSE', 3, 'B'],
  ['stu-03', 'Karthik Sundaram', 'karthik.s', '2022IT0108', 'IT', 4, 'A'],
  ['stu-04', 'Nila Prakash', 'nila.p', '2024ECE0231', 'ECE', 2, 'C'],
  ['stu-05', 'Rohan Iyer', 'rohan.i', '2023MECH0056', 'MECH', 3, 'A'],
  ['stu-06', 'Sana Fathima', 'sana.f', '2022AIDS0019', 'AIDS', 4, 'A'],
  ['stu-07', 'Vikram Balaji', 'vikram.b', '2024EEE0143', 'EEE', 2, 'B'],
  ['stu-08', 'Ishita Nair', 'ishita.n', '2023IT0277', 'IT', 3, 'C'],
  ['stu-09', 'Harini Venkatesh', 'harini.v', '2025CSE0011', 'CSE', 1, 'A'],
  ['stu-10', 'Arjun Krishnan', 'arjun.k', '2022ECE0190', 'ECE', 4, 'B'],
  ['stu-11', 'Meghna Das', 'meghna.d', '2024AIDS0088', 'AIDS', 2, 'A'],
  ['stu-12', 'Tharun Kumar', 'tharun.k', '2023MECH0102', 'MECH', 3, 'B'],
]

const students: StudentUser[] = studentSeeds.map(([id, fullName, username, registerNumber, department, year, section], i) => ({
  id,
  role: 'student',
  username,
  fullName,
  registerNumber,
  department,
  year,
  section,
  createdAt: `2025-0${(i % 6) + 1}-1${i % 9}T09:30:00.000Z`,
  active: id !== 'stu-12',
}))

const faculty: FacultyUser[] = [
  {
    id: 'fac-01',
    role: 'faculty',
    username: DEMO_CREDENTIALS.faculty.username,
    fullName: 'Dr. Meera Subramanian',
    department: 'CSE',
    designation: 'Associate Professor · Achievement Coordinator',
    reviewDepartments: ['CSE', 'AIDS'],
    createdAt: '2024-06-03T08:00:00.000Z',
    active: true,
  },
  {
    id: 'fac-02',
    role: 'faculty',
    username: 'anand.faculty',
    fullName: 'Prof. Anand Ramesh',
    department: 'ECE',
    designation: 'Assistant Professor',
    reviewDepartments: ['ECE', 'EEE'],
    createdAt: '2024-06-03T08:00:00.000Z',
    active: true,
  },
  {
    id: 'fac-03',
    role: 'faculty',
    username: 'kavitha.faculty',
    fullName: 'Dr. Kavitha Joseph',
    department: 'IT',
    designation: 'Professor',
    // Also covers MECH while that department's reviewer account is inactive.
    reviewDepartments: ['IT', 'MECH'],
    createdAt: '2024-07-15T08:00:00.000Z',
    active: true,
  },
  {
    id: 'fac-04',
    role: 'faculty',
    username: 'suresh.faculty',
    fullName: 'Prof. Suresh Natarajan',
    department: 'MECH',
    designation: 'Assistant Professor',
    reviewDepartments: ['MECH'],
    createdAt: '2025-01-09T08:00:00.000Z',
    active: false,
  },
]

const admins: AdminUser[] = [
  {
    id: 'adm-01',
    role: 'admin',
    username: DEMO_CREDENTIALS.admin.username,
    fullName: 'Lakshmi Varadhan',
    department: 'Office of Academic Records',
    designation: 'Records Administrator',
    createdAt: '2024-05-20T08:00:00.000Z',
    active: true,
  },
]

export const SEED_USERS: User[] = [...students, ...faculty, ...admins]

type AchievementSeed = [
  student: string,
  category: AchievementCategory,
  eventName: string,
  organizer: string,
  eventDate: string,
  location: string,
  type: AchievementType,
  position: string,
  status: SubmissionStatus,
  file: CertificateFileType,
]

const achievementSeeds: AchievementSeed[] = [
  // Aarav Menon — the demo student, spread across three academic years
  ['stu-01', 'Hackathon', 'CodeHarbour 36-Hour Hackathon', 'Harbour Developers Guild', '2026-09-13', 'Chennai', 'Winner', 'First place, open track', 'submitted', 'application/pdf'],
  ['stu-01', 'Paper Presentation', 'National Symposium on Applied Computing', 'Department of CSE', '2026-08-22', 'On campus', 'Best Paper', 'Best Paper — Systems track', 'under_review', 'image/png'],
  ['stu-01', 'Internship', 'Summer Research Internship', 'Lumen Analytics Lab', '2026-06-30', 'Bengaluru', 'Participant', '', 'needs_attention', 'application/pdf'],
  ['stu-01', 'Workshop', 'Hands-on Workshop on Rust for Systems', 'Open Source Circle', '2026-03-07', 'Online', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-01', 'Competition', 'Inter-College Algorithmic Programming Contest', 'Algorithm Society', '2025-11-15', 'Coimbatore', 'Runner-up', 'Second place', 'verified', 'image/jpeg'],
  ['stu-01', 'Sports', 'Zonal Table Tennis Championship', 'Zonal Sports Council', '2025-09-20', 'Madurai', 'Finalist', 'Men’s singles finalist', 'verified', 'image/jpeg'],
  ['stu-01', 'Conference', 'Student Conference on Responsible AI', 'Fairfield Research Forum', '2025-02-12', 'Hyderabad', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-01', 'Cultural', 'Annual Cultural Fest — Quiz', 'Student Cultural Committee', '2024-10-04', 'On campus', 'Winner', 'First place, team of three', 'verified', 'image/png'],

  ['stu-02', 'Hackathon', 'GreenGrid Energy Hackathon', 'Power Systems Collective', '2026-09-05', 'Chennai', 'Finalist', 'Top 10 of 60 teams', 'submitted', 'application/pdf'],
  ['stu-02', 'Workshop', 'UI Accessibility Workshop', 'Inclusive Design Network', '2026-07-19', 'Online', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-02', 'Competition', 'State-Level Debate Championship', 'Speakers’ Forum', '2025-12-02', 'Tiruchirappalli', 'Winner', 'Best Speaker', 'verified', 'image/jpeg'],

  ['stu-03', 'Internship', 'Backend Engineering Internship', 'Northwind Software Studio', '2026-05-31', 'Pune', 'Participant', '', 'under_review', 'application/pdf'],
  ['stu-03', 'Hackathon', 'Smart Campus Ideathon', 'Department of IT', '2025-08-28', 'On campus', 'Best Project', 'Best Project award', 'verified', 'image/png'],
  ['stu-03', 'Conference', 'Cloud Native Student Summit', 'Cloud Learners Forum', '2025-03-18', 'Bengaluru', 'Participant', '', 'verified', 'application/pdf'],

  ['stu-04', 'Competition', 'Embedded Systems Design Challenge', 'Circuit Makers Association', '2026-09-26', 'Chennai', 'Runner-up', 'Second place', 'submitted', 'image/jpeg'],
  ['stu-04', 'Workshop', 'PCB Design Fundamentals', 'Department of ECE', '2026-02-10', 'On campus', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-04', 'Cultural', 'Inter-College Classical Dance Festival', 'Arts Heritage Trust', '2025-12-20', 'Thanjavur', 'Winner', 'First place, solo', 'needs_attention', 'image/jpeg'],

  ['stu-05', 'Competition', 'Student Formula Design Review', 'Motorsport Students’ Society', '2026-01-24', 'Coimbatore', 'Finalist', 'Design finalist', 'verified', 'application/pdf'],
  ['stu-05', 'Sports', 'University Athletics Meet — 400m', 'University Sports Board', '2025-10-11', 'Chennai', 'Winner', 'Gold medal', 'verified', 'image/png'],
  ['stu-05', 'Workshop', 'CNC Machining Workshop', 'Department of MECH', '2026-08-08', 'On campus', 'Participant', '', 'under_review', 'application/pdf'],

  ['stu-06', 'Paper Presentation', 'Conference on Data-Centric AI', 'Applied Learning Society', '2026-07-03', 'Kochi', 'Best Paper', 'Best Student Paper', 'verified', 'application/pdf'],
  ['stu-06', 'Internship', 'Machine Learning Internship', 'Quill Data Labs', '2025-12-15', 'Remote', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-06', 'Hackathon', 'Health-Tech Datathon', 'Open Health Data Forum', '2026-09-19', 'Chennai', 'Winner', 'First place', 'under_review', 'image/png'],
  ['stu-06', 'Conference', 'Regional NLP Meetup', 'Language Tech Circle', '2025-04-26', 'Online', 'Participant', '', 'verified', 'application/pdf'],

  ['stu-07', 'Competition', 'Renewable Energy Model Expo', 'Department of EEE', '2026-03-14', 'On campus', 'Runner-up', 'Second place', 'verified', 'image/jpeg'],
  ['stu-07', 'Sports', 'Inter-Department Football League', 'Physical Education Department', '2026-09-02', 'On campus', 'Winner', 'Champions', 'submitted', 'image/jpeg'],

  ['stu-08', 'Workshop', 'Ethical Hacking Bootcamp', 'Secure Code Collective', '2026-04-25', 'Online', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-08', 'Hackathon', 'FinTech Build Weekend', 'Ledger Labs Community', '2026-08-30', 'Bengaluru', 'Finalist', 'Top 5', 'needs_attention', 'application/pdf'],
  ['stu-08', 'Cultural', 'Short Film Competition', 'Campus Media Club', '2025-11-08', 'On campus', 'Runner-up', 'Second place', 'verified', 'image/png'],

  ['stu-09', 'Workshop', 'Introduction to Git and Open Source', 'Open Source Circle', '2026-09-27', 'On campus', 'Participant', '', 'submitted', 'application/pdf'],
  ['stu-09', 'Competition', 'First-Year Coding Sprint', 'Department of CSE', '2026-08-16', 'On campus', 'Winner', 'First place', 'verified', 'image/png'],

  ['stu-10', 'Internship', 'RF Design Internship', 'Signalpath Systems', '2026-06-20', 'Hyderabad', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-10', 'Paper Presentation', 'Symposium on Wireless Systems', 'Department of ECE', '2025-09-05', 'On campus', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-10', 'Other', 'Community Radio Volunteer Programme', 'Campus Community Radio', '2025-06-14', 'On campus', 'Other', 'Volunteer of the semester', 'verified', 'image/jpeg'],

  ['stu-11', 'Hackathon', 'AI for Agriculture Hackathon', 'Rural Innovation Network', '2026-07-26', 'Madurai', 'Runner-up', 'Second place', 'verified', 'application/pdf'],
  ['stu-11', 'Conference', 'Women in Data Science Student Day', 'Data Science Student Chapter', '2026-03-08', 'Chennai', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-11', 'Workshop', 'Responsible AI Policy Workshop', 'Civic Tech Forum', '2026-09-24', 'Online', 'Participant', '', 'under_review', 'application/pdf'],

  ['stu-12', 'Sports', 'Inter-College Volleyball Tournament', 'Zonal Sports Council', '2025-08-09', 'Salem', 'Finalist', 'Runners-up team', 'verified', 'image/jpeg'],
  ['stu-12', 'Competition', 'Robotics Line-Follower Challenge', 'Robotics Club', '2025-02-22', 'On campus', 'Participant', '', 'needs_attention', 'image/png'],
  ['stu-02', 'Paper Presentation', 'Human–Computer Interaction Student Colloquium', 'Interaction Design Society', '2024-11-21', 'Online', 'Participant', '', 'verified', 'application/pdf'],
  ['stu-05', 'Cultural', 'Street Theatre Festival', 'Student Cultural Committee', '2024-10-04', 'On campus', 'Runner-up', 'Second place', 'verified', 'image/jpeg'],
]

const FACULTY_BY_DEPT: Record<string, string> = { CSE: 'fac-01', IT: 'fac-03', ECE: 'fac-02', MECH: 'fac-04', EEE: 'fac-02', AIDS: 'fac-01' }

function addDays(iso: string, days: number, hour = 10): string {
  const d = new Date(`${iso}T${String(hour).padStart(2, '0')}:15:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)

/**
 * A one- or two-sentence description assembled only from values the student
 * actually entered. Nothing is invented: missing parts are simply left out.
 */
export function describeAchievement(input: {
  achievementType?: AchievementType | ''
  position?: string
  eventName?: string
  organizer?: string
  eventDate?: string
  location?: string
  category?: AchievementCategory | ''
  customCategory?: string
}): string {
  const eventName = input.eventName?.trim()
  if (!eventName) return ''
  const position = input.position?.trim()
  const organizer = input.organizer?.trim()
  const location = input.location?.trim()
  const { achievementType, eventDate, category } = input
  const when = eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? new Date(`${eventDate}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''
  const where = !location ? '' : location.toLowerCase() === 'online' ? ' (online)' : ` in ${location}`
  const by = organizer ? `, organised by ${organizer}` : ''
  let lead: string
  if (!achievementType || achievementType === 'Participant') lead = `Participated in ${eventName}`
  else if (achievementType === 'Other') lead = position ? `${position} at ${eventName}` : `Recognised at ${eventName}`
  else lead = `${achievementType} at ${eventName}`
  // For "Other" the position already leads the sentence, so it isn't repeated.
  const pos = position && achievementType && achievementType !== 'Other' ? ` — ${position}` : ''
  const label = category === 'Other' ? input.customCategory?.trim() : category
  const cat = label ? ` Recorded as a${/^[aeiou]/i.test(label) ? 'n' : ''} ${label.toLowerCase()} achievement.` : ''
  return `${lead}${pos}${by}${where}${when ? `, ${when}` : ''}.${cat}`
}

/** Optional supporting details students added to some seeded records. */
const SEED_DETAILS: Record<string, string> = {
  'CodeHarbour 36-Hour Hackathon': 'Team of four. Built an offline-first attendance app for rural schools using React Native and SQLite.',
  'National Symposium on Applied Computing': 'Paper: “Lightweight scheduling for edge devices”, co-authored with Diya Raghavan.',
  'Summer Research Internship': 'Eight-week internship on data-quality tooling. Mentor: lab research lead.',
  'Inter-College Algorithmic Programming Contest': 'Three-person team; solved 7 of 9 problems.',
  'Health-Tech Datathon': 'Predictive triage model trained on an anonymised public dataset.',
}


const studentsById = new Map(students.map((s) => [s.id, s]))
const facultyById = new Map(faculty.map((f) => [f.id, f]))

export const SEED_ACHIEVEMENTS: Achievement[] = achievementSeeds.map((seed, i) => {
  const [studentId, category, eventName, organizer, eventDate, location, achievementType, position, status, fileType] = seed
  const student = studentsById.get(studentId)!
  const reviewerId = FACULTY_BY_DEPT[student.department]
  const reviewer = facultyById.get(reviewerId)!
  // Timeline (days after the event): submitted, review started the next day, decision 1–4 days later.
  const subDay = 3 + (i % 5)
  const at = (day: number, hour = 10) => addDays(eventDate, day, hour)
  const submittedAt = at(subDay)
  const year = eventDate.slice(0, 4)
  const ext = fileType === 'application/pdf' ? 'pdf' : fileType === 'image/png' ? 'png' : 'jpg'

  // Histories follow the same transitions the review service enforces:
  // submitted → under_review → verified | needs_attention → (resubmitted) → submitted …
  const history: Achievement['history'] = []
  const comments: Achievement['comments'] = []
  const push = (to: SubmissionStatus, when: string, actor: User, kind: NonNullable<StatusEvent['kind']>, note?: string) =>
    history.push({ status: to, at: when, byName: actor.fullName, kind, fromStatus: history.at(-1)?.status, actorId: actor.id, actorRole: actor.role, note })
  const say = (id: string, actor: User, body: string, when: string, type: ReviewComment['type']) =>
    comments.push({ id, authorId: actor.id, authorName: actor.fullName, authorRole: actor.role, body, createdAt: when, type })

  push('submitted', submittedAt, student, 'submitted')
  if (eventName === 'National Symposium on Applied Computing') {
    // A full correction cycle, ending back under review.
    const request = 'The upload shows the participation page only. Please add the page that shows the Best Paper award.'
    const reply = 'Added the award page from the symposium proceedings and resubmitted.'
    push('under_review', at(subDay, 15), reviewer, 'status')
    push('needs_attention', at(subDay + 1), reviewer, 'status', request)
    say(`cmt-seed-${i}a`, reviewer, request, at(subDay + 1), 'correction_request')
    push('submitted', at(subDay + 3), student, 'resubmitted', reply)
    say(`cmt-seed-${i}b`, student, reply, at(subDay + 3), 'review_update')
    push('under_review', at(subDay + 5), reviewer, 'status')
  } else if (status !== 'submitted') {
    const decidedAt = at(subDay + 2 + (i % 4))
    push('under_review', at(subDay + 1), reviewer, 'status')
    if (status === 'under_review') {
      say(`cmt-seed-${i}`, reviewer, 'Thanks — I am checking this with the organising department. No action needed from you yet.', at(subDay + 1, 11), 'general')
    } else if (status === 'needs_attention') {
      const request = 'The name on the certificate does not match your registered name, and the event date is not visible. Please upload a clearer copy.'
      push('needs_attention', decidedAt, reviewer, 'status', request)
      say(`cmt-seed-${i}`, reviewer, request, decidedAt, 'correction_request')
    } else {
      const remark = i % 3 === 0 ? 'Verified against the organiser’s participant list. Well done.' : undefined
      push('verified', decidedAt, reviewer, 'status', remark)
      if (remark) say(`cmt-seed-v${i}`, reviewer, remark, decidedAt, 'review_update')
    }
  }

  return {
    id: `ach-${String(i + 1).padStart(3, '0')}`,
    reference: `CP-${year}-${String(140 + i * 7).padStart(4, '0')}`,
    studentId,
    category,
    eventName,
    organizer,
    eventDate,
    location: location || undefined,
    achievementType,
    position: position || undefined,
    details: SEED_DETAILS[eventName],
    description: describeAchievement({ achievementType, position, eventName, organizer, eventDate, location, category }),
    certificate: {
      fileName: `${slug(eventName)}-certificate.${ext}`,
      fileType,
      // Records with a bundled demo file (data/demoAssets.ts) report that file's real size.
      sizeBytes: DEMO_ASSETS[eventName]?.sizeBytes ?? 180_000 + ((i * 97_331) % 1_600_000),
      previewUrl: DEMO_ASSETS[eventName]?.path,
    },
    status,
    submittedAt,
    updatedAt: history[history.length - 1].at,
    reviewerId: status === 'submitted' ? undefined : reviewerId,
    comments,
    history,
  }
})

/**
 * Seed notifications for the demo student, derived from the same status
 * history the records carry, so they never contradict a record's status.
 */
const NOTICE: Record<string, Pick<AppNotification, 'title' | 'tone' | 'type'>> = {
  submitted: { title: 'Certificate submitted', tone: 'info', type: 'submitted' },
  resubmitted: { title: 'Achievement updated', tone: 'info', type: 'resubmitted' },
  under_review: { title: 'Review started', tone: 'info', type: 'review_started' },
  needs_attention: { title: 'Correction requested', tone: 'attention', type: 'correction_requested' },
  verified: { title: 'Certificate verified', tone: 'success', type: 'verified' },
}

export const SEED_NOTIFICATIONS: AppNotification[] = SEED_ACHIEVEMENTS.filter((a) => a.studentId === 'stu-01')
  .flatMap((a) =>
    a.history.map((h, j) => {
      const key = h.kind === 'resubmitted' ? 'resubmitted' : h.kind === 'submitted' ? 'submitted' : h.status
      return {
        id: `ntf-seed-${a.id}-${j}`,
        userId: a.studentId,
        achievementId: a.id,
        createdAt: h.at,
        read: true,
        ...NOTICE[key],
        body: `${a.eventName} (${a.reference})`,
      }
    }),
  )
  .sort((x, y) => y.createdAt.localeCompare(x.createdAt) || x.id.localeCompare(y.id))
  .slice(0, 12)
  .map((n, i) => ({ ...n, read: i > 1 }))
