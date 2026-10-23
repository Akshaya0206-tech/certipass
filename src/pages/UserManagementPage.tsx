import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { AccountStatusButton, AccountStatusLabel } from '../components/admin/AccountStatus'
import { ButtonLink } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '../components/ui/Filters'
import { CHEVRON } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagination } from '../components/ui/Pagination'
import { EmptyState } from '../components/ui/States'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useUsers } from '../hooks/useData'
import { cn } from '../lib/cn'
import { formatDate, ordinalYear } from '../lib/format'
import type { Role, User } from '../types'

export const ROLE_STYLE: Record<Role, string> = {
  student: 'bg-lavender-100 text-lavender-700',
  faculty: 'bg-navy-50 text-navy-800',
  admin: 'bg-terracotta-50 text-terracotta-700',
}

export function RoleTag({ role }: { role: Role }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium capitalize', ROLE_STYLE[role])}>{role}</span>
}

type Sort = 'name' | 'recent'

export default function UserManagementPage() {
  const users = useUsers()
  const config = useAcademicConfig()
  const navigate = useNavigate()
  const sortId = useId()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [department, setDepartment] = useState('all')
  const [state, setState] = useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = useState<Sort>('name')

  // Departments that appear on accounts, including ones no longer in the configuration.
  const departmentOptions = useMemo(() => {
    const codes = new Set([...config.departments.map((d) => d.code), ...users.filter((u) => u.role !== 'admin').map((u) => u.department)])
    return [...codes].sort()
  }, [config, users])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users
      .filter((u) => role === 'all' || u.role === role)
      .filter((u) => department === 'all' || u.department === department)
      .filter((u) => state === 'all' || (state === 'active' ? u.active : !u.active))
      .filter((u) => !q || `${u.fullName} ${u.username} ${u.role === 'student' ? u.registerNumber : ''}`.toLowerCase().includes(q))
      .sort((a, b) => (sort === 'recent' ? b.createdAt.localeCompare(a.createdAt) || a.fullName.localeCompare(b.fullName) : a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id)))
  }, [users, query, role, department, state, sort])

  const active = query !== '' || role !== 'all' || department !== 'all' || state !== 'all'
  const paging = usePagination(rows, 10, `${query}|${role}|${department}|${state}|${sort}`)
  const reset = () => {
    setQuery('')
    setRole('all')
    setDepartment('all')
    setState('all')
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div className="min-w-[150px]">
          <Link to={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-navy-900 hover:underline">
            {u.fullName}
          </Link>
          <p className="font-mono text-[11.5px] text-ink-muted">@{u.username}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => <RoleTag role={u.role} /> },
    { key: 'reg', header: 'Register no.', render: (u) => (u.role === 'student' ? <span className="font-mono text-[12.5px] text-ink-soft">{u.registerNumber}</span> : <span className="text-ink-muted">—</span>), hideBelow: 'lg' },
    { key: 'dept', header: 'Department', render: (u) => <span className="text-ink-soft">{u.department}</span>, hideBelow: 'md' },
    {
      key: 'year',
      header: 'Year · Sec.',
      render: (u) => (u.role === 'student' ? <span className="whitespace-nowrap text-ink-soft">{ordinalYear(u.year)} · {u.section}</span> : <span className="text-ink-muted">—</span>),
      hideBelow: 'lg',
    },
    { key: 'created', header: 'Created', render: (u) => <span className="whitespace-nowrap text-ink-soft">{formatDate(u.createdAt)}</span>, hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (u) => <AccountStatusLabel active={u.active} /> },
    { key: 'action', header: <span className="sr-only">Action</span>, align: 'right', hideBelow: 'sm', render: (u) => <AccountStatusButton user={u} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Administration · ${users.length} accounts`}
        title="User Management"
        description="Every student, faculty and administrator account. Open an account to see its details, correct its profile, or change its status. Students register themselves; faculty accounts are added under Faculty Management."
        actions={
          <ButtonLink to="/admin/faculty?new=1" variant="secondary" icon={<UserPlus className="size-4" aria-hidden />}>
            Add faculty
          </ButtonLink>
        }
      />
      <FilterBar active={active} onReset={reset} resultLabel={`${rows.length} of ${users.length} users`}>
        <SearchInput value={query} onChange={setQuery} placeholder="Name, username or register no." className="md:w-64" label="Search users" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex">
          <FilterSelect<Role | 'all'>
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: 'all', label: 'All roles' },
              { value: 'student', label: 'Students' },
              { value: 'faculty', label: 'Faculty' },
              { value: 'admin', label: 'Admins' },
            ]}
            className="md:w-32"
          />
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={[{ value: 'all', label: 'All departments' }, ...departmentOptions.map((d) => ({ value: d, label: d }))]} className="md:w-40" />
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
          <div className="md:w-44">
            <label htmlFor={sortId} className="sr-only">
              Sort by
            </label>
            <select
              id={sortId}
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              style={{ backgroundImage: CHEVRON }}
              className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-sm text-ink-soft focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none"
            >
              <option value="name">Name (A–Z)</option>
              <option value="recent">Recently created</option>
            </select>
          </div>
        </div>
      </FilterBar>
      <DataTable
        caption="Users"
        columns={columns}
        rows={paging.pageRows}
        rowKey={(u) => u.id}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        empty={<EmptyState title="No users match" body="Adjust the search or filters." action={active ? <button type="button" onClick={reset} className="text-sm font-medium text-navy-800 hover:underline">Clear filters</button> : undefined} />}
      />
      <Pagination {...paging} onPage={paging.setPage} noun="users" />
    </div>
  )
}
