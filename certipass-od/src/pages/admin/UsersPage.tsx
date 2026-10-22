import { useMemo, useState } from 'react'
import { CheckCircle2, KeyRound, Plus, Settings2, UserX } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { DataTable } from '../../components/ui/DataTable'
import type { Column } from '../../components/ui/DataTable'
import { FilterTabs, SearchInput } from '../../components/ui/Filters'
import { Checkbox, Field, SelectInput, TextInput } from '../../components/ui/FormField'
import { PageHeader, Section } from '../../components/ui/PageHeader'
import { EmptyState, InlineAlert } from '../../components/ui/States'
import { useUser } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { DEPARTMENTS } from '../../data/seed'
import { useAppState } from '../../hooks/useData'
import { ROLE_LABEL } from '../../layouts/navigation'
import { adminResetPassword, changeRole, createUser, setActive, updatePermissions, validateNewUser } from '../../services/adminService'
import type { NewUserInput } from '../../services/adminService'
import { ApiError, toPublic } from '../../services/auth'
import { SECTIONS, YEARS } from '../../types'
import type { PublicUser, Role } from '../../types'

type Tab = 'student' | 'faculty' | 'admin'

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-purple-dark">
      <CheckCircle2 className="size-4 text-gold-dark" aria-hidden /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-red-fg">
      <UserX className="size-4" aria-hidden /> Disabled
    </span>
  )
}

export default function UsersPage() {
  const me = useUser()
  const { users: raw } = useAppState()
  const users = useMemo(() => raw.map(toPublic), [raw])
  const [tab, setTab] = useState<Tab>('student')
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('')
  const [managing, setManaging] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users
      .filter((u) => u.role === tab)
      .filter((u) => !dept || u.department === dept)
      .filter((u) => !q || [u.name, u.username, u.email, u.registerNo ?? ''].some((v) => v.toLowerCase().includes(q)))
  }, [users, tab, query, dept])

  const columns: Column<PublicUser>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div>
          <p className="font-medium">{u.name}</p>
          <p className="text-xs text-ink-muted">{u.email}</p>
        </div>
      ),
    },
    { key: 'id', header: tab === 'student' ? 'Register no.' : 'Designation', render: (u) => (tab === 'student' ? <span className="font-mono text-[13px]">{u.registerNo}</span> : u.designation) },
    { key: 'dept', header: 'Dept', render: (u) => u.department },
    ...(tab === 'student' ? [{ key: 'yr', header: 'Year / Sec', wide: true, render: (u: PublicUser) => `${u.year} / ${u.section}` }] : []),
    ...(tab === 'faculty'
      ? [
          {
            key: 'perm',
            header: 'Review access',
            wide: true,
            render: (u: PublicUser) => (u.permissions?.canReview ? (u.permissions.scope === 'all' ? 'Approve · all depts' : 'Approve · own dept') : 'View only'),
          },
        ]
      : []),
    { key: 'status', header: 'Status', render: (u) => <ActiveBadge active={u.active} /> },
    {
      key: 'act',
      header: 'Action',
      render: (u) => (
        <Button variant="secondary" size="sm" onClick={() => setManaging(u.id)} aria-label={`Manage ${u.name}`}>
          <Settings2 className="size-4" aria-hidden /> Manage
        </Button>
      ),
    },
  ]

  const target = users.find((u) => u.id === managing) ?? null
  const count = (r: Role) => users.filter((u) => u.role === r).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students and faculty"
        description="Create accounts, switch them on or off, and set what each faculty member can do."
        actions={
          tab !== 'admin' && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> Add {tab === 'student' ? 'student' : 'faculty'}
            </Button>
          )
        }
      />

      <div className="panel">
        <div className="space-y-3 border-b border-line p-4">
          <FilterTabs
            label="Account type"
            value={tab}
            onChange={(t) => {
              setTab(t)
              setDept('')
            }}
            tabs={[
              { value: 'student', label: 'Students', count: count('student') },
              { value: 'faculty', label: 'Faculty', count: count('faculty') },
              { value: 'admin', label: 'Administrators', count: count('admin') },
            ]}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, username or email" label="Search accounts" />
            <div className="sm:w-52">
              <label htmlFor="u-dept" className="sr-only">
                Department
              </label>
              <SelectInput id="u-dept" value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">All departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>
        </div>
        <DataTable
          caption={`${ROLE_LABEL[tab]} accounts`}
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          empty={<EmptyState title="No accounts found" body="Try a different search or department." />}
          card={(u) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{u.name}</p>
                  <p className="truncate text-xs text-ink-muted">{u.email}</p>
                </div>
                <ActiveBadge active={u.active} />
              </div>
              <p className="text-[13px] text-ink-soft">
                {u.department} · {u.registerNo ?? u.designation}
              </p>
              <Button variant="secondary" size="sm" onClick={() => setManaging(u.id)}>
                <Settings2 className="size-4" aria-hidden /> Manage
              </Button>
            </div>
          )}
        />
      </div>

      <RolesMatrix />

      {target && <ManageDialog key={target.id} user={target} isSelf={target.id === me.id} onClose={() => setManaging(null)} />}
      {adding && tab !== 'admin' && <AddDialog role={tab} onClose={() => setAdding(false)} />}
    </div>
  )
}

function RolesMatrix() {
  const rows: Array<[string, boolean, boolean, boolean]> = [
    ['Create and submit own OD applications', true, false, false],
    ['View applications from own department', false, true, true],
    ['View applications from all departments', false, false, true],
    ['Approve or reject applications', false, true, true],
    ['Open and print approved OD passes', true, true, true],
    ['Create and disable accounts', false, false, true],
    ['Change roles and review permissions', false, false, true],
    ['Export reports', false, true, true],
  ]
  const mark = (v: boolean) => (v ? <span aria-label="Allowed">✓</span> : <span aria-label="Not allowed" className="text-ink-muted">–</span>)
  return (
    <Section title="Role permissions">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">What each role can do</caption>
          <thead>
            <tr className="border-b border-line-strong bg-lavender">
              <th scope="col" className="kicker px-4 py-2.5">Capability</th>
              <th scope="col" className="kicker px-4 py-2.5 text-center">Student</th>
              <th scope="col" className="kicker px-4 py-2.5 text-center">Faculty</th>
              <th scope="col" className="kicker px-4 py-2.5 text-center">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([label, s, f, a]) => (
              <tr key={label}>
                <th scope="row" className="px-4 py-2.5 font-normal">{label}</th>
                <td className="px-4 py-2.5 text-center font-semibold text-purple">{mark(s)}</td>
                <td className="px-4 py-2.5 text-center font-semibold text-purple">{mark(f)}</td>
                <td className="px-4 py-2.5 text-center font-semibold text-purple">{mark(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">Faculty review access is adjustable per person under Manage. Faculty with “own department” scope only see applications from their department.</p>
    </Section>
  )
}

function ManageDialog({ user, isSelf, onClose }: { user: PublicUser; isSelf: boolean; onClose: () => void }) {
  const toast = useToast()
  const [canRev, setCanRev] = useState(user.permissions?.canReview ?? false)
  const [scope, setScope] = useState<'department' | 'all'>(user.permissions?.scope ?? 'department')
  const [role, setRole] = useState<Role>(user.role)
  const [tempPw, setTempPw] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmDisable, setConfirmDisable] = useState(false)
  const isStaff = user.role !== 'student'

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key)
    setError('')
    try {
      await fn()
      toast.success(ok)
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That change could not be saved.')
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Dialog open title={user.name} onClose={onClose} wide footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
        <div className="space-y-5">
          <p className="text-sm text-ink-muted">
            {ROLE_LABEL[user.role]} · {user.department} · <span className="font-mono">{user.username}</span>
          </p>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}

          <section aria-labelledby="m-status" className="space-y-2">
            <h3 id="m-status" className="text-sm font-semibold text-purple-dark">Account status</h3>
            <div className="flex flex-wrap items-center gap-3">
              <ActiveBadge active={user.active} />
              {user.active ? (
                <Button variant="danger" size="sm" disabled={isSelf} onClick={() => setConfirmDisable(true)}>
                  Disable account
                </Button>
              ) : (
                <Button variant="secondary" size="sm" loading={busy === 'enable'} onClick={() => run('enable', () => setActive(user.id, true), 'Account enabled.')}>
                  Enable account
                </Button>
              )}
              {isSelf && <span className="text-xs text-ink-muted">You cannot disable your own account.</span>}
            </div>
          </section>

          {user.role === 'faculty' && (
            <section aria-labelledby="m-perm" className="space-y-3 border-t border-line pt-4">
              <h3 id="m-perm" className="text-sm font-semibold text-purple-dark">Review permissions</h3>
              <Checkbox label="Can approve and reject applications" checked={canRev} onChange={(e) => setCanRev(e.target.checked)} />
              <Field label="Applications visible">
                <SelectInput value={scope} onChange={(e) => setScope(e.target.value as 'department' | 'all')}>
                  <option value="department">Own department only ({user.department})</option>
                  <option value="all">All departments</option>
                </SelectInput>
              </Field>
              <Button size="sm" loading={busy === 'perm'} onClick={() => run('perm', () => updatePermissions(user.id, { canReview: canRev, scope }), 'Permissions updated.')}>
                Save permissions
              </Button>
            </section>
          )}

          {isStaff && (
            <section aria-labelledby="m-role" className="space-y-3 border-t border-line pt-4">
              <h3 id="m-role" className="text-sm font-semibold text-purple-dark">Role</h3>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Role" className="min-w-48">
                  <SelectInput value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
                    <option value="faculty">Faculty</option>
                    <option value="admin">Administrator</option>
                  </SelectInput>
                </Field>
                <Button size="sm" variant="secondary" disabled={isSelf || role === user.role} loading={busy === 'role'} onClick={() => run('role', () => changeRole(user.id, role), 'Role changed.')}>
                  Change role
                </Button>
              </div>
              {isSelf && <p className="text-xs text-ink-muted">You cannot change your own role.</p>}
            </section>
          )}

          <section aria-labelledby="m-pw" className="space-y-3 border-t border-line pt-4">
            <h3 id="m-pw" className="text-sm font-semibold text-purple-dark">Reset password</h3>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Temporary password" hint="At least 8 characters, letters and numbers." className="min-w-56 flex-1">
                <TextInput type="text" value={tempPw} onChange={(e) => setTempPw(e.target.value)} autoComplete="off" />
              </Field>
              <Button size="sm" variant="secondary" disabled={tempPw.length < 8} loading={busy === 'pw'} onClick={async () => (await run('pw', () => adminResetPassword(user.id, tempPw), 'Password reset.')) && setTempPw('')}>
                <KeyRound className="size-4" aria-hidden /> Set password
              </Button>
            </div>
          </section>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDisable}
        title="Disable this account?"
        description={`${user.name} will be signed out and will not be able to sign in until the account is enabled again. Their records are kept.`}
        confirmLabel="Disable account"
        tone="danger"
        loading={busy === 'disable'}
        onClose={() => setConfirmDisable(false)}
        onConfirm={async () => {
          const ok = await run('disable', () => setActive(user.id, false), 'Account disabled.')
          if (ok) setConfirmDisable(false)
        }}
      />
    </>
  )
}

function AddDialog({ role, onClose }: { role: 'student' | 'faculty'; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<NewUserInput>({ role, name: '', username: '', email: '', department: '', tempPassword: '', registerNo: '', year: 'I', section: 'A', designation: '' })
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errors = validateNewUser(f)
  const e = (k: keyof NewUserInput) => (attempted ? errors[k] : undefined)
  const set = <K extends keyof NewUserInput>(k: K, v: NewUserInput[K]) => setF((cur) => ({ ...cur, [k]: v }))

  async function save() {
    setAttempted(true)
    if (Object.keys(errors).length) return
    setBusy(true)
    setError('')
    try {
      await createUser(f)
      toast.success(`${f.name} was added. Share the temporary password securely.`)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The account could not be created.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      wide
      title={`Add ${role === 'student' ? 'student' : 'faculty'} account`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Create account</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><InlineAlert tone="error">{error}</InlineAlert></div>}
        <Field label="Full name" required error={e('name')} className="sm:col-span-2">
          <TextInput value={f.name} onChange={(ev) => set('name', ev.target.value)} />
        </Field>
        <Field label="Username" required error={e('username')}>
          <TextInput value={f.username} onChange={(ev) => set('username', ev.target.value)} autoCapitalize="none" />
        </Field>
        <Field label="College email" required error={e('email')}>
          <TextInput type="email" value={f.email} onChange={(ev) => set('email', ev.target.value)} placeholder="name@rajalakshmi.edu.in" />
        </Field>
        <Field label="Department" required error={e('department')}>
          <SelectInput value={f.department} onChange={(ev) => set('department', ev.target.value)}>
            <option value="">Select</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>{d.code} · {d.name}</option>
            ))}
          </SelectInput>
        </Field>
        {role === 'student' ? (
          <>
            <Field label="Register number" required error={e('registerNo')}>
              <TextInput value={f.registerNo} onChange={(ev) => set('registerNo', ev.target.value)} inputMode="numeric" maxLength={13} className="font-mono" />
            </Field>
            <Field label="Year" required error={e('year')}>
              <SelectInput value={f.year} onChange={(ev) => set('year', ev.target.value as NewUserInput['year'])}>
                {YEARS.map((y) => <option key={y}>{y}</option>)}
              </SelectInput>
            </Field>
            <Field label="Section" required error={e('section')}>
              <SelectInput value={f.section} onChange={(ev) => set('section', ev.target.value)}>
                {SECTIONS.map((s) => <option key={s}>{s}</option>)}
              </SelectInput>
            </Field>
          </>
        ) : (
          <Field label="Designation" required error={e('designation')}>
            <TextInput value={f.designation} onChange={(ev) => set('designation', ev.target.value)} />
          </Field>
        )}
        <Field label="Temporary password" required error={e('tempPassword')} hint="They should change it after first sign-in." className="sm:col-span-2">
          <TextInput type="text" value={f.tempPassword} onChange={(ev) => set('tempPassword', ev.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Dialog>
  )
}
