import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { KeyRound, Lock, PenLine, SearchX, Trash2 } from 'lucide-react'
import { AccountStatusButton, AccountStatusLabel } from '../components/admin/AccountStatus'
import { DeleteFacultyDialog, ResetPasswordDialog } from '../components/admin/FacultyActions'
import { DetailList } from '../components/RecordDetails'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { Button, ButtonLink } from '../components/ui/Button'
import { Field, SelectInput, TextInput } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/States'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../context/ToastContext'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useAchievements, useUsers } from '../hooks/useData'
import { formatDate, formatDateTime, initials, YEAR_LABEL } from '../lib/format'
import { activeDepartments, activeSections, departmentName } from '../services/academicService'
import { ADMIN_EDITABLE, updateUserByAdmin, validateUserEdit } from '../services/adminService'
import type { UserEdit } from '../services/adminService'
import { getAdminOverview } from '../services/analyticsService'
import { facultyScope, getFacultyRecordSummary } from '../services/facultyService'
import { useStore } from '../services/store'
import type { User } from '../types'
import { RoleTag } from './UserManagementPage'

const toEdit = (u: User): UserEdit => ({
  fullName: u.fullName,
  department: u.department,
  year: u.role === 'student' ? String(u.year) : '',
  section: u.role === 'student' ? u.section : '',
  designation: u.role !== 'student' ? u.designation : '',
  reviewDepartments: u.role === 'faculty' ? facultyScope(u) : [],
})

export default function AdminUserDetailPage() {
  const { id = '' } = useParams()
  const users = useUsers()
  const achievements = useAchievements()
  const audit = useStore((s) => s.audit)
  const config = useAcademicConfig()
  const toast = useToast()
  const user = users.find((u) => u.id === id)
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<UserEdit | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof UserEdit, string>>>({})
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [resetting, setResetting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // "Edit" in the faculty list arrives here with ?edit=1 and opens the form straight away.
  useEffect(() => {
    if (params.get('edit') === '1' && user) {
      setEdit(toEdit(user))
      setErrors({})
      setEditing(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams, user])

  const records = useMemo(() => (user?.role === 'student' ? achievements.filter((a) => a.studentId === user.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) : []), [achievements, user])
  const counts = useMemo(() => getAdminOverview([], records), [records])
  // For a faculty account: the records their departments hold. They oversee
  // these records; they never had to approve them.
  const scopeSummary = useMemo(
    () => (user?.role === 'faculty' ? getFacultyRecordSummary(user.id, achievements, users) : null),
    [user, achievements, users],
  )
  const accountHistory = useMemo(() => audit.filter((e) => e.targetUserId === id), [audit, id])

  if (!user) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Overview', to: '/admin' }, { label: 'User Management', to: '/admin/users' }, { label: 'Not found' }]} />
        <div className="paper">
          <EmptyState icon={SearchX} title="Account not found" body="This account doesn’t exist. It may have been removed by a demo-data reset." action={<ButtonLink to="/admin/users" variant="secondary">Back to User Management</ButtonLink>} />
        </div>
      </div>
    )
  }

  const editable = ADMIN_EDITABLE[user.role] as readonly string[]
  // Offer active options, plus whatever the account currently has.
  const departmentOptions = [...new Map([...activeDepartments(config), ...config.departments.filter((d) => d.code === user.department)].map((d) => [d.code, d])).values()]
  const sectionOptions = [...new Set([...activeSections(config), ...(user.role === 'student' ? [user.section] : [])])]

  function startEditing() {
    setEdit(toEdit(user!))
    setErrors({})
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!edit || inFlight.current) return
    const errs = validateUserEdit(user!, edit)
    setErrors(errs)
    if (Object.keys(errs).length) return
    inFlight.current = true
    setSaving(true)
    try {
      await updateUserByAdmin(user!.id, edit)
      toast.success('Account updated', user!.fullName)
      setEditing(false)
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  // Only fields that exist on the account model. Credentials are held separately and are never shown.
  const rows: [string, React.ReactNode][] = [
    ['Full name', user.fullName],
    ['Username', <span key="u" className="font-mono">@{user.username}</span>],
    ['Role', <RoleTag key="r" role={user.role} />],
  ]
  if (user.role === 'student') {
    rows.push(['Register number', <span key="reg" className="font-mono">{user.registerNumber}</span>], ['Department', departmentName(user.department, config)], ['Year', YEAR_LABEL[user.year]], ['Section', user.section])
  } else if (user.role === 'faculty') {
    rows.push(['Department', departmentName(user.department, config)], ['Designation', user.designation], ['Departments covered', facultyScope(user).join(', ')])
  } else {
    rows.push(['Office', user.department], ['Designation', user.designation])
  }
  rows.push(['Account status', <AccountStatusLabel key="s" active={user.active} pending={user.pending} />], ['Created', formatDate(user.createdAt)])

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: 'Overview', to: '/admin' }, { label: user.role === 'faculty' ? 'Faculty Management' : 'User Management', to: user.role === 'faculty' ? '/admin/faculty' : '/admin/users' }, { label: user.fullName }]} />
        <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lavender-200 text-[16px] font-semibold text-lavender-700" aria-hidden>
              {initials(user.fullName)}
            </span>
            <div className="min-w-0">
              <p className="label-archival">{user.role} account</p>
              <h1 className="display mt-1 text-[20px] leading-tight md:text-[23px]">{user.fullName}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                <span className="font-mono">@{user.username}</span>
                <AccountStatusLabel active={user.active} pending={user.pending} />
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing && (
              <Button variant="secondary" onClick={startEditing} icon={<PenLine className="size-4" aria-hidden />}>
                Edit details
              </Button>
            )}
            {user.role === 'faculty' && (
              <Button variant="secondary" onClick={() => setResetting(true)} icon={<KeyRound className="size-4" aria-hidden />}>
                Reset password
              </Button>
            )}
            <AccountStatusButton user={user} size="md" />
            {user.role === 'faculty' && (
              <Button variant="danger" onClick={() => setDeleting(true)} icon={<Trash2 className="size-4" aria-hidden />}>
                Delete
              </Button>
            )}
          </div>
        </header>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-8">
          {editing && edit ? (
            <form onSubmit={save} noValidate className="paper space-y-5 p-5" aria-labelledby="edit-heading">
              <h2 id="edit-heading" className="label-archival">Edit details</h2>
              <Field label="Full name" required error={errors.fullName}>
                <TextInput value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} maxLength={80} />
              </Field>
              {editable.includes('department') && (
                <Field label="Department" required error={errors.department}>
                  <SelectInput value={edit.department} onChange={(e) => setEdit({ ...edit, department: e.target.value })}>
                    {departmentOptions.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                        {d.active === false ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              )}
              {user.role === 'student' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Year" required error={errors.year}>
                    <SelectInput value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })}>
                      {[1, 2, 3, 4].map((y) => (
                        <option key={y} value={y}>{YEAR_LABEL[y]}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Section" required error={errors.section}>
                    <SelectInput value={edit.section} onChange={(e) => setEdit({ ...edit, section: e.target.value })}>
                      {sectionOptions.map((s) => (
                        <option key={s} value={s}>Section {s}</option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              )}
              {editable.includes('designation') && (
                <Field label="Designation" required error={errors.designation}>
                  <TextInput value={edit.designation} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} maxLength={80} />
                </Field>
              )}
              {user.role === 'faculty' && (
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium text-ink-soft">Covers students from</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {config.departments.map((d) => (
                      <label key={d.code} className="inline-flex items-center gap-2 text-sm text-ink-soft">
                        <input
                          type="checkbox"
                          className="size-4 accent-navy-800"
                          checked={edit.reviewDepartments.includes(d.code)}
                          onChange={(e) => setEdit({ ...edit, reviewDepartments: e.target.checked ? [...edit.reviewDepartments, d.code] : edit.reviewDepartments.filter((c) => c !== d.code) })}
                        />
                        {d.code}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-ink-muted">If none are ticked, they review their own department.</p>
                </fieldset>
              )}
              <p className="flex items-start gap-2 rounded-md bg-parchment/70 px-3 py-2.5 text-[12.5px] text-ink-soft">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Username, role{user.role === 'student' ? ', register number' : ''} and password can’t be changed here.
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
            <section className="paper p-5" aria-labelledby="account-heading">
              <h2 id="account-heading" className="label-archival mb-4">{user.role === 'student' ? 'Academic profile' : user.role === 'faculty' ? 'Faculty profile' : 'Administrator profile'}</h2>
              <DetailList rows={rows} />
              <p className="mt-5 border-t border-line pt-3 text-[12px] text-ink-muted">
                Passwords are never shown or stored in readable form.{' '}
                {user.role === 'faculty' ? 'Use Reset password to give this account a new one.' : 'They can’t be viewed or changed from this page.'}
              </p>
            </section>
          )}

          {accountHistory.length > 0 && (
            <section aria-labelledby="audit-heading">
              <h2 id="audit-heading" className="label-archival mb-3">Admin actions on this account</h2>
              <ol className="space-y-2.5 border-l border-line-strong pl-4 text-[13px]">
                {accountHistory.map((e) => (
                  <li key={e.id}>
                    <p className="text-ink-soft">{e.summary}</p>
                    <p className="text-[12px] text-ink-muted">
                      {e.actorName} · {formatDateTime(e.at)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-8">
          {user.role === 'student' && (
            <section aria-labelledby="records-heading">
              <h2 id="records-heading" className="label-archival mb-3">Achievements</h2>
              <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                {(
                  [
                    ['Records', counts.totalRecords],
                    ['Winner', counts.winner],
                    ['Runner-up', counts.runner_up],
                    ['Participant', counts.participant],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="bg-white px-4 py-3">
                    <dt className="text-[12px] text-ink-muted">{k}</dt>
                    <dd className="font-serif text-xl text-navy-900 tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {records.length === 0 ? (
                <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-sm text-ink-muted">This student hasn’t submitted any achievements yet.</p>
              ) : (
                <>
                  <ul className="paper divide-y divide-line">
                    {records.slice(0, 6).map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                        <div className="min-w-0 flex-1 basis-48">
                          <Link to={`/admin/records/${a.id}`} className="font-medium text-navy-900 hover:underline">
                            {a.eventName}
                          </Link>
                          <p className="text-[12px] text-ink-muted">
                            <span className="font-mono">{a.reference}</span> · {a.category} · submitted {formatDate(a.submittedAt)}
                          </p>
                        </div>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                  {records.length > 6 && (
                    <Link to={`/admin/records?q=${encodeURIComponent(user.registerNumber)}`} className="mt-2 inline-block text-[13px] font-medium text-navy-800 hover:underline">
                      See all {records.length} records
                    </Link>
                  )}
                </>
              )}
            </section>
          )}

          {user.role === 'faculty' && (
            <section aria-labelledby="scope-heading">
              <h2 id="scope-heading" className="label-archival mb-3">Records covered</h2>
              <p className="mb-3 text-[13px] text-ink-muted">
                Achievement records belonging to students in {facultyScope(user).join(' and ')}. This account can read and report on them; it does not approve
                them.
              </p>
              {!scopeSummary || scopeSummary.total === 0 ? (
                <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-sm text-ink-muted">
                  No achievement records in this account’s departments yet.
                </p>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                    {(
                      [
                        ['Records', scopeSummary.total],
                        ['Winner', scopeSummary.winner],
                        ['Runner-up', scopeSummary.runner_up],
                        ['Students', scopeSummary.studentsWithRecords],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="bg-white px-4 py-3">
                        <dt className="text-[12px] text-ink-muted">{k}</dt>
                        <dd className="font-serif text-xl text-navy-900 tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[12px] text-ink-muted">
                    {scopeSummary.studentsWithRecords} of {scopeSummary.students} students in these departments have at least one record.
                  </p>
                </>
              )}
            </section>
          )}

          {user.role === 'admin' && <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-sm text-ink-muted">Administrator accounts have no achievements or review activity.</p>}
        </div>
      </div>

      {user.role === 'faculty' && (
        <>
          <ResetPasswordDialog user={user} open={resetting} onClose={() => setResetting(false)} />
          <DeleteFacultyDialog user={user} open={deleting} onClose={() => setDeleting(false)} onDeleted={() => navigate('/admin/faculty', { replace: true })} />
        </>
      )}
    </div>
  )
}
