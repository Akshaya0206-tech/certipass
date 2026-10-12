import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Lock, Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Field, TextInput } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../context/ToastContext'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useAchievements, useUsers } from '../hooks/useData'
import { cn } from '../lib/cn'
import { YEAR_LABEL } from '../lib/format'
import {
  addDepartment,
  addSection,
  getConfigUsage,
  removeDepartment,
  removeSection,
  renameDepartment,
  setCategoryActive,
  setDepartmentActive,
  setSectionActive,
  validateDepartment,
  validateSection,
} from '../services/academicService'
import type { AchievementCategory, Department } from '../types'

/** A change that needs confirming before it is applied. */
interface Pending {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  run: () => void
  success: string
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap', active ? 'text-navy-800' : 'text-ink-muted')}>
      <span className={cn('size-1.5 rounded-full', active ? 'bg-sky-500' : 'bg-line-strong')} aria-hidden />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

const linkButton = 'text-[13px] font-medium text-navy-800 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline'

export default function AcademicConfigPage() {
  const config = useAcademicConfig()
  const users = useUsers()
  const achievements = useAchievements()
  const toast = useToast()
  const usage = useMemo(() => getConfigUsage(users, achievements), [users, achievements])
  const [pending, setPending] = useState<Pending | null>(null)
  const [dept, setDept] = useState({ code: '', name: '' })
  const [deptErrors, setDeptErrors] = useState<Partial<Record<'code' | 'name', string>>>({})
  const [section, setSection] = useState('')
  const [sectionError, setSectionError] = useState<string>()
  const [renaming, setRenaming] = useState<Department | null>(null)
  const [newName, setNewName] = useState('')
  const [renameError, setRenameError] = useState<string>()

  /** Apply a change, reporting success or the reason it was refused. */
  function apply(run: () => void, success: string) {
    try {
      run()
      toast.success(success)
      return true
    } catch (err) {
      toast.error('Change not made', err instanceof Error ? err.message : undefined)
      return false
    }
  }

  function submitDepartment(e: FormEvent) {
    e.preventDefault()
    const errors = validateDepartment(dept, config)
    setDeptErrors(errors)
    if (Object.keys(errors).length) return
    if (apply(() => addDepartment(dept), `Department ${dept.code.trim().toUpperCase()} added`)) setDept({ code: '', name: '' })
  }

  function submitSection(e: FormEvent) {
    e.preventDefault()
    const error = validateSection(section, config)
    setSectionError(error)
    if (error) return
    if (apply(() => addSection(section), `Section ${section.trim().toUpperCase()} added`)) setSection('')
  }

  function submitRename(e: FormEvent) {
    e.preventDefault()
    if (!renaming) return
    const error = validateDepartment({ code: renaming.code, name: newName }, config, renaming.code).name
    setRenameError(error)
    if (error) return
    if (apply(() => renameDepartment(renaming.code, newName), `${renaming.code} renamed`)) setRenaming(null)
  }

  const studentsByYear = [1, 2, 3, 4].map((y) => users.filter((u) => u.role === 'student' && u.year === y).length)

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Administration"
        title="Academic Configuration"
        description="The departments, sections and achievement categories offered across CertiPass. Registration, profiles and the submission form all read from here. Changes never alter existing students or achievements."
      />

      {/* Departments */}
      <section aria-labelledby="dept-heading">
        <h2 id="dept-heading" className="font-serif text-[16px] text-navy-900">Departments</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">A department that students or faculty belong to can be deactivated but not removed. Deactivated departments stay on existing accounts and aren’t offered to new ones.</p>
        <div className="paper relative overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Departments</caption>
            <thead>
              <tr className="border-b border-line bg-parchment/60">
                {['Code', 'Name', 'Students', 'Faculty', 'Status', ''].map((h, i) => (
                  <th key={i} scope="col" className={cn('label-archival px-4 py-2.5 font-medium whitespace-nowrap', i === 2 || i === 3 ? 'hidden text-right sm:table-cell' : '', i === 5 && 'text-right')}>
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.departments.map((d) => {
                const u = usage.departments[d.code] ?? { students: 0, faculty: 0, reviewers: 0 }
                const inUse = u.students + u.faculty + u.reviewers > 0
                const isActive = d.active !== false
                return (
                  <tr key={d.code} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3 font-mono text-[12.5px] text-terracotta-600">{d.code}</td>
                    <td className={cn('px-4 py-3', isActive ? 'text-navy-900' : 'text-ink-muted')}>{d.name}</td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-ink-soft sm:table-cell">{u.students}</td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-ink-soft sm:table-cell">{u.faculty}</td>
                    <td className="px-4 py-3"><StatusPill active={isActive} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1">
                        <button type="button" className={linkButton} onClick={() => { setRenaming(d); setNewName(d.name); setRenameError(undefined) }}>
                          Rename<span className="sr-only"> {d.code}</span>
                        </button>
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() =>
                            setPending({
                              title: isActive ? `Deactivate ${d.code}?` : `Reactivate ${d.code}?`,
                              body: isActive
                                ? `${d.name} will no longer be offered when students register or accounts are created. The ${u.students} student${u.students === 1 ? '' : 's'} and ${u.faculty} faculty member${u.faculty === 1 ? '' : 's'} already in it are not changed.`
                                : `${d.name} will be offered again for new registrations and accounts.`,
                              confirmLabel: isActive ? 'Deactivate department' : 'Reactivate department',
                              danger: isActive,
                              run: () => setDepartmentActive(d.code, !isActive),
                              success: `${d.code} ${isActive ? 'deactivated' : 'reactivated'}`,
                            })
                          }
                        >
                          {isActive ? 'Deactivate' : 'Reactivate'}<span className="sr-only"> {d.code}</span>
                        </button>
                        <button
                          type="button"
                          className={linkButton}
                          disabled={inUse}
                          title={inUse ? 'Still used by students or faculty — deactivate it instead' : undefined}
                          onClick={() =>
                            setPending({
                              title: `Remove ${d.code}?`,
                              body: `${d.name} isn’t used by any student or faculty account, so it can be removed. This can’t be undone.`,
                              confirmLabel: 'Remove department',
                              danger: true,
                              run: () => removeDepartment(d.code),
                              success: `${d.code} removed`,
                            })
                          }
                        >
                          Remove<span className="sr-only"> {d.code}{inUse ? ' (unavailable: in use)' : ''}</span>
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <form onSubmit={submitDepartment} noValidate className="mt-4 grid gap-3 rounded-md border border-dashed border-line-strong bg-parchment/40 p-4 sm:grid-cols-[140px_1fr_auto] sm:items-start" aria-label="Add a department">
          <Field label="Code" required error={deptErrors.code}>
            <TextInput value={dept.code} onChange={(e) => { setDept({ ...dept, code: e.target.value.toUpperCase() }); setDeptErrors({}) }} maxLength={6} placeholder="CIVIL" className="font-mono uppercase" />
          </Field>
          <Field label="Department name" required error={deptErrors.name}>
            <TextInput value={dept.name} onChange={(e) => { setDept({ ...dept, name: e.target.value }); setDeptErrors({}) }} maxLength={80} placeholder="Civil Engineering" />
          </Field>
          <Button type="submit" className="sm:mt-[26px]" icon={<Plus className="size-4" aria-hidden />}>
            Add department
          </Button>
        </form>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Sections */}
        <section aria-labelledby="section-heading">
          <h2 id="section-heading" className="font-serif text-[16px] text-navy-900">Sections</h2>
          <p className="mt-1 mb-4 text-sm text-ink-muted">Sections students can choose when they register. A section with students can be deactivated but not removed.</p>
          <ul className="paper divide-y divide-line" aria-label="Sections">
            {config.sections.map((s) => {
              const count = usage.sections[s.name] ?? 0
              return (
                <li key={s.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className={cn('w-20 font-medium', s.active ? 'text-navy-900' : 'text-ink-muted')}>Section {s.name}</span>
                  <span className="text-[13px] text-ink-muted tabular-nums">{count} student{count === 1 ? '' : 's'}</span>
                  <StatusPill active={s.active} />
                  <span className="ml-auto inline-flex gap-3">
                    <button
                      type="button"
                      className={linkButton}
                      onClick={() =>
                        setPending({
                          title: s.active ? `Deactivate section ${s.name}?` : `Reactivate section ${s.name}?`,
                          body: s.active ? `Section ${s.name} won’t be offered to new students. The ${count} student${count === 1 ? '' : 's'} already in it are not changed.` : `Section ${s.name} will be offered to new students again.`,
                          confirmLabel: s.active ? 'Deactivate section' : 'Reactivate section',
                          danger: s.active,
                          run: () => setSectionActive(s.name, !s.active),
                          success: `Section ${s.name} ${s.active ? 'deactivated' : 'reactivated'}`,
                        })
                      }
                    >
                      {s.active ? 'Deactivate' : 'Reactivate'}<span className="sr-only"> section {s.name}</span>
                    </button>
                    <button
                      type="button"
                      className={linkButton}
                      disabled={count > 0}
                      title={count > 0 ? 'Still has students — deactivate it instead' : undefined}
                      onClick={() =>
                        setPending({ title: `Remove section ${s.name}?`, body: `No students are in section ${s.name}, so it can be removed. This can’t be undone.`, confirmLabel: 'Remove section', danger: true, run: () => removeSection(s.name), success: `Section ${s.name} removed` })
                      }
                    >
                      Remove<span className="sr-only"> section {s.name}{count > 0 ? ' (unavailable: in use)' : ''}</span>
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <form onSubmit={submitSection} noValidate className="mt-4 flex flex-wrap items-start gap-3 rounded-md border border-dashed border-line-strong bg-parchment/40 p-4" aria-label="Add a section">
            <Field label="New section" required error={sectionError} className="w-40">
              <TextInput value={section} onChange={(e) => { setSection(e.target.value.toUpperCase()); setSectionError(undefined) }} maxLength={3} placeholder="E" className="uppercase" />
            </Field>
            <Button type="submit" className="mt-[26px]" icon={<Plus className="size-4" aria-hidden />}>
              Add section
            </Button>
          </form>
        </section>

        {/* Years */}
        <section aria-labelledby="year-heading">
          <h2 id="year-heading" className="font-serif text-[16px] text-navy-900">Study years</h2>
          <p className="mt-1 mb-4 flex items-start gap-2 text-sm text-ink-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Fixed at four years in this prototype, so they aren’t configurable here.
          </p>
          <ul className="paper divide-y divide-line" aria-label="Study years">
            {[1, 2, 3, 4].map((y, i) => (
              <li key={y} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium text-navy-900">{YEAR_LABEL[y]}</span>
                <span className="text-[13px] text-ink-muted tabular-nums">{studentsByYear[i]} student{studentsByYear[i] === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Categories */}
      <section aria-labelledby="cat-heading">
        <h2 id="cat-heading" className="font-serif text-[16px] text-navy-900">Achievement categories</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          The category list is fixed, but each category can be offered or withheld for new submissions. Existing records keep their category. Students can describe anything else under “Other”, which always stays available.
        </p>
        <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3" aria-label="Achievement categories">
          {config.categories.map((c) => {
            const count = usage.categories[c.name] ?? 0
            const locked = c.name === 'Other'
            return (
              <li key={c.name} className="flex items-center justify-between gap-3 bg-white px-4 py-3">
                <div>
                  <p className={cn('font-medium', c.active ? 'text-navy-900' : 'text-ink-muted')}>{c.name}</p>
                  <p className="text-[12.5px] text-ink-muted tabular-nums">
                    {count} record{count === 1 ? '' : 's'} · {c.active ? 'offered' : 'not offered'}
                  </p>
                </div>
                {locked ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted"><Lock className="size-3" aria-hidden /> Always on</span>
                ) : (
                  <button
                    type="button"
                    className={linkButton}
                    onClick={() =>
                      setPending({
                        title: c.active ? `Stop offering “${c.name}”?` : `Offer “${c.name}” again?`,
                        body: c.active ? `Students won’t be able to choose ${c.name} for new achievements. The ${count} existing record${count === 1 ? '' : 's'} keep this category.` : `Students will be able to choose ${c.name} for new achievements again.`,
                        confirmLabel: c.active ? 'Stop offering' : 'Offer category',
                        danger: c.active,
                        run: () => setCategoryActive(c.name as AchievementCategory, !c.active),
                        success: `${c.name} ${c.active ? 'is no longer offered' : 'is offered again'}`,
                      })
                    }
                  >
                    {c.active ? 'Stop offering' : 'Offer again'}<span className="sr-only"> {c.name}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Confirmation for consequential changes */}
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        size="sm"
        title={pending?.title ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.danger ? 'danger' : 'primary'}
              onClick={() => {
                if (pending) apply(pending.run, pending.success)
                setPending(null)
              }}
            >
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{pending?.body}</p>
      </Dialog>

      <Dialog
        open={!!renaming}
        onClose={() => setRenaming(null)}
        size="sm"
        title={`Rename ${renaming?.code ?? ''}`}
        description="The code stays the same, so existing accounts are unaffected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-department-form">
              Save name
            </Button>
          </>
        }
      >
        <form id="rename-department-form" onSubmit={submitRename} noValidate>
          <Field label="Department name" required error={renameError}>
            <TextInput value={newName} onChange={(e) => { setNewName(e.target.value); setRenameError(undefined) }} maxLength={80} autoFocus />
          </Field>
        </form>
      </Dialog>
    </div>
  )
}
