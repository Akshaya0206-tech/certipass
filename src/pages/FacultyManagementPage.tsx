import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert, UserPlus } from 'lucide-react'
import { AccountStatusButton, AccountStatusLabel } from '../components/admin/AccountStatus'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { Dialog } from '../components/ui/Dialog'
import { FilterBar, FilterSelect, SearchInput } from '../components/ui/Filters'
import { Field, PasswordInput, SelectInput, TextInput } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { useToast } from '../context/ToastContext'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useAchievements, useUsers } from '../hooks/useData'
import { formatDate } from '../lib/format'
import { activeDepartments } from '../services/academicService'
import { AdminError, createFacultyAccount, getFacultyReviewActivity, validateFacultyInput } from '../services/adminService'
import type { FacultyErrors, FacultyInput } from '../services/adminService'
import { reviewScope } from '../services/reviewService'
import type { FacultyUser } from '../types'

const EMPTY: FacultyInput = { fullName: '', username: '', department: '', designation: '', reviewDepartments: [], password: '', confirmPassword: '' }

type Row = FacultyUser & { actions: number; lastAction?: string }

export default function FacultyManagementPage() {
  const users = useUsers()
  const achievements = useAchievements()
  const config = useAcademicConfig()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('all')
  const [state, setState] = useState<'all' | 'active' | 'inactive'>('all')
  const [adding, setAdding] = useState(false)

  // "Add faculty" links from elsewhere open the form directly.
  useEffect(() => {
    if (params.get('new') === '1') {
      setAdding(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const faculty = useMemo(() => users.filter((u): u is FacultyUser => u.role === 'faculty'), [users])
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    return faculty
      .filter((u) => department === 'all' || u.department === department || reviewScope(u).includes(department))
      .filter((u) => state === 'all' || (state === 'active' ? u.active : !u.active))
      .filter((u) => !q || `${u.fullName} ${u.username}`.toLowerCase().includes(q))
      .map((u) => {
        const activity = getFacultyReviewActivity(u, achievements)
        return { ...u, actions: activity.length, lastAction: activity[0]?.at }
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [faculty, achievements, query, department, state])

  const active = query !== '' || department !== 'all' || state !== 'all'
  const reset = () => {
    setQuery('')
    setDepartment('all')
    setState('all')
  }

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Faculty member',
      render: (u) => (
        <div className="min-w-[160px]">
          <Link to={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-navy-900 hover:underline">
            {u.fullName}
          </Link>
          <p className="font-mono text-[11.5px] text-ink-muted">@{u.username}</p>
        </div>
      ),
    },
    { key: 'dept', header: 'Department', render: (u) => <span className="text-ink-soft">{u.department}</span> },
    { key: 'designation', header: 'Designation', render: (u) => <span className="block max-w-[220px] truncate text-ink-soft">{u.designation}</span>, hideBelow: 'lg' },
    { key: 'scope', header: 'Reviews', render: (u) => <span className="font-mono text-[12px] text-ink-soft">{reviewScope(u).join(', ')}</span>, hideBelow: 'md' },
    {
      key: 'activity',
      header: 'Review actions',
      hideBelow: 'lg',
      render: (u) => (
        <span className="whitespace-nowrap text-ink-soft">
          <span className="tabular-nums">{u.actions}</span>
          {u.lastAction && <span className="text-[12px] text-ink-muted"> · last {formatDate(u.lastAction)}</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (u) => <AccountStatusLabel active={u.active} /> },
    { key: 'action', header: <span className="sr-only">Action</span>, align: 'right', hideBelow: 'sm', render: (u) => <AccountStatusButton user={u} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Administration · ${faculty.length} faculty accounts`}
        title="Faculty Management"
        description="Faculty accounts are created here by an administrator; there is no public faculty registration. Open an account to see its profile and review activity, or to edit it."
        actions={
          <Button onClick={() => setAdding(true)} icon={<UserPlus className="size-4" aria-hidden />}>
            Add Faculty
          </Button>
        }
      />
      <FilterBar active={active} onReset={reset} resultLabel={`${rows.length} of ${faculty.length} faculty`}>
        <SearchInput value={query} onChange={setQuery} placeholder="Name or username" className="md:w-64" label="Search faculty" />
        <div className="grid grid-cols-2 gap-2 md:flex">
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={[{ value: 'all', label: 'All departments' }, ...config.departments.map((d) => ({ value: d.code, label: d.code }))]} className="md:w-40" />
          <FilterSelect<'all' | 'active' | 'inactive'>
            label="Account status"
            value={state}
            onChange={setState}
            options={[
              { value: 'all', label: 'Any status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            className="md:w-32"
          />
        </div>
      </FilterBar>
      <DataTable
        caption="Faculty accounts"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        empty={<EmptyState title="No faculty match" body="Adjust the search or filters." />}
      />
      <p className="text-[12px] text-ink-muted">The department filter matches a member’s own department and the departments they review. Review actions are counted from the records’ status history.</p>

      <AddFacultyDialog open={adding} onClose={() => setAdding(false)} onCreated={(f) => navigate(`/admin/users/${f.id}`)} />
    </div>
  )
}

function AddFacultyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (f: FacultyUser) => void }) {
  const toast = useToast()
  const config = useAcademicConfig()
  const users = useUsers()
  const [form, setForm] = useState<FacultyInput>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FacultyErrors>({})
  const [formError, setFormError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const departments = activeDepartments(config)

  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setSubmitted(false)
      setServerErrors({})
      setFormError(undefined)
    }
  }, [open])

  const live = validateFacultyInput(form, users)
  const err = (k: keyof FacultyInput) => serverErrors[k] ?? (submitted ? live[k] : undefined)
  const set = <K extends keyof FacultyInput>(k: K, v: FacultyInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setServerErrors((e) => ({ ...e, [k]: undefined }))
    setFormError(undefined)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    if (Object.keys(validateFacultyInput(form, users)).length) {
      setFormError('Please fix the highlighted fields.')
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      const created = await createFacultyAccount(form)
      toast.success('Faculty account created', `${created.fullName} can now sign in at the faculty sign-in page.`)
      onClose()
      onCreated(created)
    } catch (error) {
      if (error instanceof AdminError && error.field) setServerErrors({ [error.field]: error.message })
      setFormError(error instanceof Error ? error.message : 'The account could not be created.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title="Add a faculty account"
      description="The account can sign in to the faculty workspace only. Share the username and initial password with the faculty member yourself."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="add-faculty-form" loading={saving} icon={<UserPlus className="size-4" aria-hidden />}>
            Create account
          </Button>
        </>
      }
    >
      <form id="add-faculty-form" onSubmit={submit} noValidate className="space-y-5">
        {formError && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-terracotta-300 bg-terracotta-50 px-3.5 py-3 text-sm text-terracotta-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={err('fullName')} className="sm:col-span-2">
            <TextInput value={form.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={80} placeholder="e.g. Dr. Priya Nair" />
          </Field>
          <Field label="Username" required error={err('username')} hint="Lowercase letters, numbers, dots or underscores. Used to sign in.">
            <TextInput value={form.username} onChange={(e) => set('username', e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} autoComplete="off" />
          </Field>
          <Field label="Designation" required error={err('designation')}>
            <TextInput value={form.designation} onChange={(e) => set('designation', e.target.value)} maxLength={80} placeholder="e.g. Assistant Professor" />
          </Field>
          <Field label="Department" required error={err('department')} className="sm:col-span-2">
            <SelectInput value={form.department} onChange={(e) => set('department', e.target.value)}>
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-soft">
            Reviews submissions from <span className="font-normal text-ink-muted">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {departments.map((d) => (
              <label key={d.code} className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="size-4 accent-navy-800"
                  checked={form.reviewDepartments.includes(d.code)}
                  onChange={(e) => set('reviewDepartments', e.target.checked ? [...form.reviewDepartments, d.code] : form.reviewDepartments.filter((c) => c !== d.code))}
                />
                {d.code}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">If none are ticked, they review their own department.</p>
        </fieldset>
        <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Field label="Initial password" required error={err('password')} hint="At least 8 characters, with upper and lower case letters and a number.">
            <PasswordInput value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" required error={err('confirmPassword')}>
            <PasswordInput value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <p className="text-[12.5px] text-ink-muted">
          The password is stored only as a salted hash and can’t be viewed afterwards. Prototype note: accounts created here exist in this browser only.
        </p>
      </form>
    </Dialog>
  )
}
