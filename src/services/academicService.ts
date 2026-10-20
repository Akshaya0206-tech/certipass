/*
 * Academic configuration: departments, sections and which achievement
 * categories are offered. One shared source for registration, profiles, the
 * submission wizard and the admin workspace.
 *
 * Changes never rewrite existing students or achievements:
 *  - an item still referenced by a record can't be removed, only deactivated;
 *  - a deactivated item stays on the records that use it but isn't offered
 *    for new registrations or submissions.
 * Study years are fixed at 1–4 and are not configurable.
 *
 * Changes require a signed-in administrator. Like every check in the
 * prototype, that runs in the browser and is not real access control.
 */
import { SEED_ACADEMIC_CONFIG } from '../data/mockData'
import { ACHIEVEMENT_CATEGORIES } from '../types'
import type { AcademicConfig, Achievement, AchievementCategory, Department, User } from '../types'
import { requireActor } from './auth/actor'
import { recordAudit } from './auditService'
import { getState, setState } from './store'
import type { DbState } from './store'

export class ConfigError extends Error {
  readonly code: 'invalid' | 'duplicate' | 'in_use' | 'not_found'
  constructor(code: ConfigError['code'], message: string) {
    super(message)
    this.name = 'ConfigError'
    this.code = code
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** The current configuration, repaired if stored data is incomplete. */
export function getAcademicConfig(state: Pick<DbState, 'config'> = getState()): AcademicConfig {
  const stored = state.config.find((c) => c.id === 'academic')
  if (!stored) return SEED_ACADEMIC_CONFIG
  // Every fixed category must be present exactly once, in the canonical order.
  const categories = ACHIEVEMENT_CATEGORIES.map((name) => ({ name, active: stored.categories.find((c) => c.name === name)?.active ?? true }))
  return { ...stored, categories }
}

const isActive = (d: Department) => d.active !== false

export const allDepartments = (config = getAcademicConfig()) => config.departments
export const activeDepartments = (config = getAcademicConfig()) => config.departments.filter(isActive)
export const allSections = (config = getAcademicConfig()) => config.sections.map((s) => s.name)
export const activeSections = (config = getAcademicConfig()) => config.sections.filter((s) => s.active).map((s) => s.name)
export const activeCategories = (config = getAcademicConfig()): AchievementCategory[] => config.categories.filter((c) => c.active).map((c) => c.name)

/** Full department name for a code; the code itself if it is no longer configured. */
export function departmentName(code: string, config = getAcademicConfig()): string {
  return config.departments.find((d) => d.code === code)?.name ?? code
}

export const isKnownDepartment = (code: string, config = getAcademicConfig()) => config.departments.some((d) => d.code === code)
export const isActiveDepartment = (code: string, config = getAcademicConfig()) => config.departments.some((d) => d.code === code && isActive(d))
export const isKnownSection = (name: string, config = getAcademicConfig()) => config.sections.some((s) => s.name === name)
export const isActiveSection = (name: string, config = getAcademicConfig()) => config.sections.some((s) => s.name === name && s.active)

export interface ConfigUsage {
  departments: Record<string, { students: number; faculty: number; covering: number }>
  sections: Record<string, number>
  categories: Record<string, number>
}

/** How many records reference each configuration item. */
export function getConfigUsage(users: User[] = getState().users, achievements: Achievement[] = getState().achievements): ConfigUsage {
  const usage: ConfigUsage = { departments: {}, sections: {}, categories: {} }
  const dept = (code: string) => (usage.departments[code] ??= { students: 0, faculty: 0, covering: 0 })
  for (const u of users) {
    if (u.role === 'student') {
      dept(u.department).students++
      usage.sections[u.section] = (usage.sections[u.section] ?? 0) + 1
    } else if (u.role === 'faculty') {
      dept(u.department).faculty++
      // Faculty who cover this department without belonging to it.
      for (const code of u.reviewDepartments ?? []) dept(code).covering++
    }
  }
  for (const a of achievements) usage.categories[a.category] = (usage.categories[a.category] ?? 0) + 1
  return usage
}

export function departmentInUse(code: string, usage = getConfigUsage()) {
  const u = usage.departments[code]
  return !!u && u.students + u.faculty + u.covering > 0
}

// ── Changing ─────────────────────────────────────────────────────────────────

function save(next: AcademicConfig, summary: string) {
  const admin = requireActor('admin')
  setState((s) => ({ ...s, config: [next] }))
  recordAudit(admin, 'config_changed', summary)
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

export function validateDepartment(input: { code: string; name: string }, config = getAcademicConfig(), editingCode?: string): Partial<Record<'code' | 'name', string>> {
  const errors: Partial<Record<'code' | 'name', string>> = {}
  const code = input.code.trim().toUpperCase()
  const name = norm(input.name)
  if (!editingCode) {
    if (!code) errors.code = 'Enter a short code, e.g. CIVIL.'
    else if (!/^[A-Z][A-Z0-9]{1,5}$/.test(code)) errors.code = 'Use 2–6 letters or digits, starting with a letter.'
    else if (config.departments.some((d) => d.code.toUpperCase() === code)) errors.code = `A department with the code ${code} already exists.`
  }
  if (!name) errors.name = 'Enter the department’s full name.'
  else if (name.length < 3 || name.length > 80) errors.name = 'The name must be 3–80 characters.'
  else if (config.departments.some((d) => d.code !== editingCode && d.name.toLowerCase() === name.toLowerCase())) errors.name = 'Another department already has this name.'
  return errors
}

export function addDepartment(input: { code: string; name: string }): Department {
  requireActor('admin')
  const config = getAcademicConfig()
  const errors = validateDepartment(input, config)
  const first = errors.code ?? errors.name
  if (first) throw new ConfigError(first.includes('already') ? 'duplicate' : 'invalid', first)
  const department: Department = { code: input.code.trim().toUpperCase(), name: norm(input.name), active: true }
  save({ ...config, departments: [...config.departments, department] }, `Added department ${department.code} — ${department.name}`)
  return department
}

export function renameDepartment(code: string, name: string) {
  requireActor('admin')
  const config = getAcademicConfig()
  if (!config.departments.some((d) => d.code === code)) throw new ConfigError('not_found', 'That department no longer exists.')
  const errors = validateDepartment({ code, name }, config, code)
  if (errors.name) throw new ConfigError(errors.name.includes('already') ? 'duplicate' : 'invalid', errors.name)
  save({ ...config, departments: config.departments.map((d) => (d.code === code ? { ...d, name: norm(name) } : d)) }, `Renamed department ${code} to ${norm(name)}`)
}

export function setDepartmentActive(code: string, active: boolean) {
  requireActor('admin')
  const config = getAcademicConfig()
  if (!config.departments.some((d) => d.code === code)) throw new ConfigError('not_found', 'That department no longer exists.')
  if (!active && activeDepartments(config).length <= 1) throw new ConfigError('invalid', 'At least one department must stay active.')
  save({ ...config, departments: config.departments.map((d) => (d.code === code ? { ...d, active } : d)) }, `${active ? 'Reactivated' : 'Deactivated'} department ${code}`)
}

/** Removal is only possible while nothing references the department. Otherwise deactivate it. */
export function removeDepartment(code: string) {
  requireActor('admin')
  const config = getAcademicConfig()
  if (!config.departments.some((d) => d.code === code)) throw new ConfigError('not_found', 'That department no longer exists.')
  if (departmentInUse(code)) throw new ConfigError('in_use', `${code} is still used by students or faculty, so it can’t be removed. Deactivate it instead.`)
  save({ ...config, departments: config.departments.filter((d) => d.code !== code) }, `Removed unused department ${code}`)
}

export function validateSection(name: string, config = getAcademicConfig()): string | undefined {
  const value = name.trim().toUpperCase()
  if (!value) return 'Enter a section name, e.g. E.'
  if (!/^[A-Z0-9]{1,3}$/.test(value)) return 'Use 1–3 letters or digits.'
  if (config.sections.some((s) => s.name.toUpperCase() === value)) return `Section ${value} already exists.`
  return undefined
}

export function addSection(name: string) {
  requireActor('admin')
  const config = getAcademicConfig()
  const error = validateSection(name, config)
  if (error) throw new ConfigError(error.includes('already') ? 'duplicate' : 'invalid', error)
  const value = name.trim().toUpperCase()
  save({ ...config, sections: [...config.sections, { name: value, active: true }] }, `Added section ${value}`)
}

export function setSectionActive(name: string, active: boolean) {
  requireActor('admin')
  const config = getAcademicConfig()
  if (!config.sections.some((s) => s.name === name)) throw new ConfigError('not_found', 'That section no longer exists.')
  if (!active && activeSections(config).length <= 1) throw new ConfigError('invalid', 'At least one section must stay active.')
  save({ ...config, sections: config.sections.map((s) => (s.name === name ? { ...s, active } : s)) }, `${active ? 'Reactivated' : 'Deactivated'} section ${name}`)
}

export function removeSection(name: string) {
  requireActor('admin')
  const config = getAcademicConfig()
  if (!config.sections.some((s) => s.name === name)) throw new ConfigError('not_found', 'That section no longer exists.')
  if ((getConfigUsage().sections[name] ?? 0) > 0) throw new ConfigError('in_use', `Section ${name} still has students, so it can’t be removed. Deactivate it instead.`)
  save({ ...config, sections: config.sections.filter((s) => s.name !== name) }, `Removed unused section ${name}`)
}

/** Offer or withhold a category for new submissions. Existing records keep their category. */
export function setCategoryActive(name: AchievementCategory, active: boolean) {
  requireActor('admin')
  const config = getAcademicConfig()
  if (!active && name === 'Other') throw new ConfigError('invalid', '“Other” must stay available so every achievement has somewhere to go.')
  save({ ...config, categories: config.categories.map((c) => (c.name === name ? { ...c, active } : c)) }, `${active ? 'Enabled' : 'Disabled'} the ${name} category for new submissions`)
}
