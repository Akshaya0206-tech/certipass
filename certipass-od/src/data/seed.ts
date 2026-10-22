/**
 * DEMO DATA. Every person, register number, event and application below is
 * fictional and exists only to make the prototype usable. Nothing here
 * represents a real student, staff member or college record.
 */
import type { AppState, AuditEntry, Department, EventType, OdApplication, OdStatus, Role, User } from '../types'

export const DEPARTMENTS: Department[] = [
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'AIDS', name: 'Artificial Intelligence and Data Science' },
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'MECH', name: 'Mechanical Engineering' },
]

export const departmentName = (code: string) => DEPARTMENTS.find((d) => d.code === code)?.name ?? code

export interface DemoAccount {
  role: Role
  username: string
  password: string
  label: string
}

/** Shown on the sign-in page so the prototype can be explored. Demo only. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'student', username: 'aarav.k', password: 'Student@123', label: 'Aarav Krishnan · CSE III' },
  { role: 'faculty', username: 'meera.r', password: 'Faculty@123', label: 'Dr. Meera Raghavan · CSE' },
  { role: 'admin', username: 'ramesh.c', password: 'Admin@123', label: 'Ramesh Chandran · Admin office' },
]

interface SeedUser {
  id: string
  role: Role
  username: string
  name: string
  department: string
  password: string
  registerNo?: string
  year?: User['year']
  section?: string
  designation?: string
  scope?: 'department' | 'all'
  canReview?: boolean
}

const SEED_USERS: SeedUser[] = [
  { id: 's1', role: 'student', username: 'aarav.k', name: 'Aarav Krishnan', department: 'CSE', registerNo: '2116230701004', year: 'III', section: 'A', password: 'Student@123' },
  { id: 's2', role: 'student', username: 'diya.r', name: 'Diya Ramesh', department: 'IT', registerNo: '2116230801017', year: 'II', section: 'B', password: 'Student@123' },
  { id: 's3', role: 'student', username: 'karthik.s', name: 'Karthik Subramanian', department: 'ECE', registerNo: '2116220401032', year: 'IV', section: 'A', password: 'Student@123' },
  { id: 's4', role: 'student', username: 'meenakshi.i', name: 'Meenakshi Iyer', department: 'AIDS', registerNo: '2116230231009', year: 'III', section: 'B', password: 'Student@123' },
  { id: 's5', role: 'student', username: 'rohan.m', name: 'Rohan Menon', department: 'MECH', registerNo: '2116240301021', year: 'II', section: 'A', password: 'Student@123' },
  { id: 's6', role: 'student', username: 'sneha.p', name: 'Sneha Pillai', department: 'CSE', registerNo: '2116240701048', year: 'II', section: 'C', password: 'Student@123' },
  { id: 's7', role: 'student', username: 'vikram.a', name: 'Vikram Anand', department: 'IT', registerNo: '2116230801039', year: 'III', section: 'A', password: 'Student@123' },
  { id: 's8', role: 'student', username: 'harini.b', name: 'Harini Balaji', department: 'AIDS', registerNo: '2116250231014', year: 'I', section: 'B', password: 'Student@123' },
  { id: 'f1', role: 'faculty', username: 'meera.r', name: 'Dr. Meera Raghavan', department: 'CSE', designation: 'Professor and Class Advisor', password: 'Faculty@123' },
  { id: 'f2', role: 'faculty', username: 'anand.k', name: 'Prof. Anand Kumar', department: 'IT', designation: 'Associate Professor', password: 'Faculty@123' },
  { id: 'f3', role: 'faculty', username: 'lakshmi.n', name: 'Dr. Lakshmi Narayanan', department: 'ECE', designation: 'Professor and Head of Department', password: 'Faculty@123' },
  { id: 'f4', role: 'faculty', username: 'suresh.b', name: 'Prof. Suresh Babu', department: 'AIDS', designation: 'Assistant Professor', password: 'Faculty@123' },
  { id: 'f5', role: 'faculty', username: 'priya.v', name: 'Dr. Priya Venkat', department: 'CSE', designation: 'Dean, Student Affairs', password: 'Faculty@123', scope: 'all' },
  { id: 'a1', role: 'admin', username: 'ramesh.c', name: 'Ramesh Chandran', department: 'CSE', designation: 'Administrative Officer', password: 'Admin@123' },
]

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(`${salt}:${password}`)
}

export function newSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

type Row = [
  studentId: string,
  eventName: string,
  type: EventType,
  organizer: string,
  venue: string,
  eventStart: string,
  eventEnd: string,
  odFrom: string,
  odUntil: string,
  reason: string,
  status: OdStatus,
  submittedAt: string,
  reviewerId?: string,
  decidedAt?: string,
  remarks?: string,
]

const ROWS: Row[] = [
  ['s1', 'Smart India Hackathon – Grand Finale', 'Hackathon', 'Ministry of Education, Government of India', 'Nodal Centre, Bengaluru', '2026-06-18', '2026-06-20', '2026-06-17', '2026-06-21', 'Selected for the grand finale as part of a six-member team. Travel and the 36-hour build window need the full period.', 'approved', '2026-06-08T10:15:00+05:30', 'f1', '2026-06-09T11:40:00+05:30'],
  ['s2', 'Workshop on Embedded Linux', 'Workshop', 'Department of ECE, Anna University', 'University Auditorium, Guindy', '2026-07-10', '2026-07-10', '2026-07-10', '2026-07-10', 'One-day hands-on workshop relevant to the IoT elective. Registration confirmation attached.', 'approved', '2026-07-03T09:05:00+05:30', 'f2', '2026-07-04T14:20:00+05:30'],
  ['s3', 'IEEE Region 10 Student Conference', 'Conference', 'IEEE Madras Section', 'Taj Coromandel, Chennai', '2026-07-24', '2026-07-26', '2026-07-24', '2026-07-26', 'Presenting a paper on low-power sensor nodes; acceptance letter attached.', 'approved', '2026-07-12T16:30:00+05:30', 'f3', '2026-07-13T10:10:00+05:30'],
  ['s4', 'Inter-College Data Science Symposium', 'Symposium', 'PSG College of Technology', 'PSG Tech, Coimbatore', '2026-08-07', '2026-08-08', '2026-08-06', '2026-08-09', 'Two-day symposium with a paper contest; the travel day is included.', 'rejected', '2026-07-28T12:00:00+05:30', 'f4', '2026-07-29T09:45:00+05:30', 'The OD period overlaps the internal assessment on 7 August. Please apply again once the assessment is rescheduled or with a revised plan.'],
  ['s5', 'South Zone Inter-University Athletics Meet', 'Sports', 'Association of Indian Universities', 'Jawaharlal Nehru Stadium, Chennai', '2026-08-14', '2026-08-16', '2026-08-13', '2026-08-16', 'Representing the college in 400 m relay. Selection list issued by the Physical Education department.', 'approved', '2026-08-05T08:50:00+05:30', 'f5', '2026-08-06T15:05:00+05:30'],
  ['s6', 'Web Security Bootcamp', 'Workshop', 'OWASP Chennai Chapter', 'IIT Madras Research Park', '2026-08-22', '2026-08-23', '2026-08-22', '2026-08-23', 'Weekend bootcamp covering the OWASP Top 10 with practical labs.', 'approved', '2026-08-14T13:25:00+05:30', 'f1', '2026-08-15T10:00:00+05:30'],
  ['s7', 'National Level Technical Symposium – Techfest', 'Technical Event', 'SRM Institute of Science and Technology', 'SRM Kattankulathur', '2026-09-05', '2026-09-06', '2026-09-05', '2026-09-06', 'Participating in the circuit-debugging and coding rounds as part of the IT department team.', 'approved', '2026-08-28T11:10:00+05:30', 'f2', '2026-08-29T12:30:00+05:30'],
  ['s1', 'Open Source Summit Student Track', 'Conference', 'The Linux Foundation', 'Hyderabad International Convention Centre', '2026-09-12', '2026-09-13', '2026-09-11', '2026-09-14', 'Accepted to present a lightning talk on a contribution to a public project. Invitation attached.', 'approved', '2026-09-01T09:40:00+05:30', 'f1', '2026-09-02T10:55:00+05:30'],
  ['s8', 'Intercollege Debate – Tamil Nadu Finals', 'Other', 'Madras Christian College', 'MCC Chetpet, Chennai', '2026-09-19', '2026-09-19', '2026-09-19', '2026-09-19', 'Team finalist; the event runs from 9 am to 5 pm.', 'rejected', '2026-09-10T15:45:00+05:30', 'f4', '2026-09-11T11:00:00+05:30', 'Supporting document is the registration form only. Please attach the finalist confirmation from the organiser and resubmit.'],
  ['s3', 'Robotics Challenge – Regional Round', 'Technical Event', 'Robotics Society of India', 'VIT Chennai Campus', '2026-09-26', '2026-09-27', '2026-09-26', '2026-09-27', 'Team lead for the line-following robot category.', 'approved', '2026-09-17T10:05:00+05:30', 'f3', '2026-09-18T09:20:00+05:30'],
  ['s4', 'Kaggle Days Meetup', 'Technical Event', 'Kaggle Days India', 'Chennai Trade Centre', '2026-10-03', '2026-10-03', '2026-10-03', '2026-10-03', 'Invited to the one-day competition track after the online qualifier.', 'approved', '2026-09-25T14:10:00+05:30', 'f4', '2026-09-26T16:00:00+05:30'],
  ['s6', 'Hack the North – Online Finale', 'Hackathon', 'Hack the North', 'Online (team will attend from campus)', '2026-10-10', '2026-10-12', '2026-10-10', '2026-10-12', 'Online finale over a weekend and Monday; a lab with network access is needed.', 'rejected', '2026-10-01T18:20:00+05:30', 'f1', '2026-10-02T10:30:00+05:30', 'Two of three days fall on a weekend and need no OD. Please request the Monday only.'],
  ['s7', 'Cloud Native Workshop', 'Workshop', 'CNCF Chennai', 'Zoho Campus, Chengalpattu', '2026-10-17', '2026-10-17', '2026-10-17', '2026-10-17', 'Full-day workshop on Kubernetes operations.', 'approved', '2026-10-08T09:55:00+05:30', 'f2', '2026-10-09T13:15:00+05:30'],
  ['s2', 'Inter-College Quiz – Tech Trivia League', 'Technical Event', 'Loyola College', 'Loyola College, Nungambakkam', '2026-10-28', '2026-10-28', '2026-10-28', '2026-10-28', 'Quiz team of three; the fixture list is attached.', 'pending', '2026-10-19T10:30:00+05:30'],
  ['s1', 'National Hackathon – Smart Campus Challenge', 'Hackathon', 'IIT Bombay – E-Cell', 'IIT Bombay, Mumbai', '2026-11-06', '2026-11-08', '2026-11-05', '2026-11-09', 'Shortlisted in the top 40 teams nationally. Includes travel on 5 and 9 November.', 'pending', '2026-10-20T15:10:00+05:30'],
  ['s5', 'Formula Student Design Review', 'Conference', 'SAE India', 'Kari Motor Speedway, Coimbatore', '2026-11-12', '2026-11-13', '2026-11-12', '2026-11-13', 'Design review for the college team vehicle; attending as the powertrain sub-team lead.', 'pending', '2026-10-21T09:20:00+05:30'],
  ['s6', 'Women in Tech Symposium', 'Symposium', 'Women Techmakers Chennai', 'Chennai Trade Centre', '2026-11-20', '2026-11-20', '2026-11-20', '2026-11-20', 'Panel attendance and a networking session.', 'pending', '2026-10-21T17:05:00+05:30'],
  ['s3', 'National Paper Presentation – Signal Processing', 'Symposium', 'NIT Trichy', 'NIT Trichy, Tiruchirappalli', '2026-11-27', '2026-11-28', '2026-11-26', '2026-11-28', 'Paper accepted for oral presentation.', 'pending', '2026-10-22T08:45:00+05:30'],
  ['s8', 'Intercollege Chess Tournament', 'Sports', 'Chennai District Chess Association', 'Egmore Indoor Stadium', '2026-12-05', '2026-12-06', '2026-12-05', '2026-12-06', 'College team selection round; draft kept for the arrival-time confirmation.', 'draft', '2026-10-22T09:10:00+05:30'],
]

const rankPrefix = (id: string) => (id.startsWith('f') ? 'faculty' : 'admin')

export async function buildSeedState(): Promise<AppState> {
  const users: User[] = []
  for (const u of SEED_USERS) {
    const salt = `seed-${u.id}`
    users.push({
      id: u.id,
      role: u.role,
      username: u.username,
      name: u.name,
      department: u.department,
      email:
        u.role === 'student'
          ? `${u.registerNo!.slice(4)}@rajalakshmi.edu.in`
          : `${u.username.replace('.', '')}@rajalakshmi.edu.in`,
      active: true,
      registerNo: u.registerNo,
      year: u.year,
      section: u.section,
      designation: u.designation,
      permissions:
        u.role === 'faculty'
          ? { canReview: u.canReview ?? true, scope: u.scope ?? 'department' }
          : undefined,
      salt,
      passwordHash: await hashPassword(u.password, salt),
    })
  }

  const byId = new Map(users.map((u) => [u.id, u]))
  const applications: OdApplication[] = []
  let appCounter = 0
  let passCounter = 0

  for (const r of ROWS) {
    const [sid, eventName, type, organizer, venue, eventStart, eventEnd, odFrom, odUntil, reason, status, submittedAt, reviewerId, decidedAt, remarks] = r
    const s = byId.get(sid)!
    const reviewer = reviewerId ? byId.get(reviewerId) : undefined
    const audit: AuditEntry[] = []
    let n = 0
    const push = (a: Omit<AuditEntry, 'id'>) => audit.push({ id: `${sid}-${appCounter}-${n++}`, ...a })

    let id: string
    if (status === 'draft') {
      id = `DRAFT-${String(++appCounter).padStart(4, '0')}`
    } else {
      id = `OD-2026-${String(++appCounter).padStart(4, '0')}`
    }
    push({ at: submittedAt, actorId: s.id, actorName: s.name, actorRole: 'student', action: status === 'draft' ? 'draft_saved' : 'submitted' })
    let passNumber: string | undefined
    let decision: OdApplication['decision']
    if (reviewer && decidedAt && (status === 'approved' || status === 'rejected')) {
      decision = { byId: reviewer.id, byName: reviewer.name, byRole: reviewer.role, at: decidedAt, remarks }
      push({ at: decidedAt, actorId: reviewer.id, actorName: reviewer.name, actorRole: rankPrefix(reviewer.id) as Role, action: status, note: remarks })
      if (status === 'approved') passNumber = `REC-OD-2026-${String(++passCounter).padStart(5, '0')}`
    }

    applications.push({
      id,
      studentId: s.id,
      studentName: s.name,
      registerNo: s.registerNo!,
      department: s.department,
      year: s.year!,
      section: s.section!,
      collegeEmail: s.email,
      eventName,
      eventType: type,
      organizer,
      venue,
      eventStart,
      eventEnd,
      odFrom,
      odUntil,
      reason,
      link: '',
      documents:
        status === 'draft'
          ? []
          : [{ id: `${id}-doc1`, name: 'invitation-letter.pdf', type: 'application/pdf', size: 184_320 + appCounter * 4096, hasContent: false }],
      declaration: status !== 'draft',
      status,
      createdAt: submittedAt,
      submittedAt: status === 'draft' ? undefined : submittedAt,
      decision,
      passNumber,
      audit,
    })
  }

  return {
    version: 1,
    users,
    applications,
    notifications: [],
    counters: { application: appCounter, pass: passCounter },
  }
}
