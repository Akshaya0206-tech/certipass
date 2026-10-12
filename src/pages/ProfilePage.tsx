import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Lock, PenLine } from 'lucide-react'
import { DetailList } from '../components/RecordDetails'
import { Button } from '../components/ui/Button'
import { Field, SelectInput, TextInput } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../context/ToastContext'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useAchievements, useRequiredUser } from '../hooks/useData'
import { formatDate, initials, YEAR_LABEL } from '../lib/format'
import { summarize } from '../services/achievementService'
import { activeSections, departmentName } from '../services/academicService'
import { EDITABLE_FIELDS, updateProfile, validateProfile } from '../services/profileService'
import { reviewScope } from '../services/reviewService'
import type { ProfileErrors } from '../services/profileService'
import type { ReactNode } from 'react'
import type { Role } from '../types'

const ROLE_TITLE: Record<Role, string> = { student: 'Student', faculty: 'Faculty', admin: 'Administrator' }

interface Draft {
  fullName: string
  year: string
  section: string
  designation: string
}

function Locked({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <Lock className="size-3 text-ink-muted" aria-label="Managed by the records office" />
    </span>
  )
}

export default function ProfilePage() {
  const user = useRequiredUser()
  const toast = useToast()
  const achievements = useAchievements()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [draft, setDraft] = useState<Draft>({ fullName: '', year: '', section: '', designation: '' })
  const config = useAcademicConfig()
  const dept = { name: departmentName(user.department, config) }
  // Active sections, plus the student's own if it has since been deactivated.
  const sectionOptions = [...new Set([...activeSections(config), ...(user.role === 'student' ? [user.section] : [])])]
  const editable = EDITABLE_FIELDS[user.role] as readonly string[]

  const stats = useMemo(() => {
    if (user.role === 'student') return summarize(achievements.filter((a) => a.studentId === user.id))
    if (user.role === 'faculty') return summarize(achievements.filter((a) => a.reviewerId === user.id))
    return null
  }, [achievements, user])

  function startEditing() {
    setDraft({
      fullName: user.fullName,
      year: user.role === 'student' ? String(user.year) : '',
      section: user.role === 'student' ? user.section : '',
      designation: user.role !== 'student' ? user.designation : '',
    })
    setErrors({})
    setEditing(true)
  }

  function patchFromDraft(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const k of editable) out[k] = draft[k as keyof Draft]
    return out
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const patch = patchFromDraft()
    const errs = validateProfile(user.role, patch)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await updateProfile(user, patch)
      toast.success('Profile updated')
      setEditing(false)
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  const rows: [string, ReactNode][] = [['Full name', user.fullName], ['Username', <Locked key="u">@{user.username}</Locked>]]
  if (user.role === 'student') {
    rows.push(
      ['Register number', <Locked key="r"><span className="font-mono">{user.registerNumber}</span></Locked>],
      ['Department', <Locked key="d">{dept?.name ?? user.department}</Locked>],
      ['Year', YEAR_LABEL[user.year]],
      ['Section', `Section ${user.section}`],
    )
  } else if (user.role === 'faculty') {
    rows.push(['Department', <Locked key="d">{dept?.name ?? user.department}</Locked>], ['Role', <Locked key="role">{ROLE_TITLE.faculty}</Locked>], ['Designation', user.designation], ['Reviews', <Locked key="scope">{reviewScope(user).join(', ')}</Locked>])
  } else {
    rows.push(['Role', <Locked key="role">{ROLE_TITLE.admin}</Locked>], ['Office', user.department])
  }
  rows.push(['Member since', formatDate(user.createdAt)])

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Account"
        title="Profile"
        description="Your details as held in CertiPass. Fields marked with a lock are managed by the records office."
        actions={
          !editing && (
            <Button variant="secondary" onClick={startEditing} icon={<PenLine className="size-4" aria-hidden />}>
              Edit profile
            </Button>
          )
        }
      />
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="self-start rounded-xl border border-line bg-white p-6 text-center">
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-lavender-200 text-xl font-semibold text-lavender-700">{initials(user.fullName)}</span>
          <p className="mt-4 font-serif text-[16px] text-navy-900">{user.fullName}</p>
          <p className="label-archival mt-1">{ROLE_TITLE[user.role]}</p>
          {stats && (
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line text-left">
              <div className="bg-white px-3 py-2.5">
                <dt className="text-[11.5px] text-ink-muted">{user.role === 'student' ? 'Submitted' : 'Reviewed'}</dt>
                <dd className="font-serif text-[16px] text-navy-900">{stats.total}</dd>
              </div>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-[11.5px] text-ink-muted">Verified</dt>
                <dd className="font-serif text-[16px] text-navy-900">{stats.verified}</dd>
              </div>
            </dl>
          )}
        </div>

        {editing ? (
          <form onSubmit={save} noValidate className="paper space-y-5 p-6" aria-labelledby="edit-heading">
            <h2 id="edit-heading" className="label-archival">Edit profile</h2>
            <Field label="Full name" required error={errors.fullName}>
              <TextInput value={draft.fullName} onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))} autoComplete="name" maxLength={80} />
            </Field>
            {user.role === 'student' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Year" required error={errors.year}>
                  <SelectInput value={draft.year} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}>
                    {[1, 2, 3, 4].map((y) => (
                      <option key={y} value={y}>{YEAR_LABEL[y]}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Section" required error={errors.section}>
                  <SelectInput value={draft.section} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}>
                    {sectionOptions.map((s) => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
            )}
            {user.role === 'faculty' && (
              <Field label="Designation" required error={errors.designation}>
                <TextInput value={draft.designation} onChange={(e) => setDraft((d) => ({ ...d, designation: e.target.value }))} maxLength={80} />
              </Field>
            )}
            <p className="flex items-start gap-2 rounded-md bg-parchment/70 px-3 py-2.5 text-[12.5px] text-ink-soft">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {user.role === 'student'
                ? 'Your username, register number, department and role can only be changed by the records office.'
                : 'Your username, department and role can only be changed by the records office.'}
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </form>
        ) : (
          <section className="paper p-6" aria-labelledby="details-heading">
            <h2 id="details-heading" className="label-archival mb-5">Account details</h2>
            <DetailList rows={rows} />
            <p className="mt-8 border-t border-line pt-4 text-[12.5px] text-ink-muted">
              Password changes are not part of this prototype. They’ll be available once secure authentication is connected.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
