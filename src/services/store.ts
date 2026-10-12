/*
 * Prototype data store.
 *
 * Holds the working dataset (users, achievements, notifications) in memory.
 * The demo seed data stays in code (data/mockData.ts); only what differs from
 * it is written to localStorage — records created in this browser, and seed
 * records changed here — so seed data and user-created data stay separate and
 * "Reset demo data" simply discards the changes.
 *
 * It deliberately holds NO credentials and NO session. Those belong to the
 * auth service (services/auth).
 *
 * Limitations: browser storage is per-device, unencrypted and can be cleared
 * or edited at any time; it is not secure production storage. localStorage is
 * capped (~5 MB), so only small image previews are kept.
 */
import { useSyncExternalStore } from 'react'
import { SEED_ACADEMIC_CONFIG, SEED_ACHIEVEMENTS, SEED_NOTIFICATIONS, SEED_USERS } from '../data/mockData'
import type { AcademicConfig, Achievement, AchievementDraft, AppNotification, AuditEvent, User } from '../types'

const STORAGE_KEY = 'certipass.data.v3'
const LEGACY_KEY_V2 = 'certipass.prototype.v2'
const LEGACY_KEY_V1 = 'certipass.prototype.v1'
const SCHEMA_VERSION = 3

export interface DbState {
  version: number
  users: User[]
  achievements: Achievement[]
  notifications: AppNotification[]
  /** Unfinished submissions. Never seeded: every draft is created in this browser. */
  drafts: AchievementDraft[]
  /** Academic configuration: a single record (id "academic"). */
  config: AcademicConfig[]
  /** Administrative actions, newest first. Never seeded. */
  audit: AuditEvent[]
}

type Collection = 'users' | 'achievements' | 'notifications' | 'drafts' | 'config' | 'audit'
const COLLECTIONS: Collection[] = ['users', 'achievements', 'notifications', 'drafts', 'config', 'audit']
type Item = { id: string }

/** What goes to localStorage: only the differences from the seed data. */
interface Overlay {
  version: number
  /** Records created in this browser. */
  added: Record<Collection, Item[]>
  /** Seed records changed in this browser, by id. */
  changed: Record<Collection, Record<string, Item>>
}

const emptyOverlay = (): Overlay => ({
  version: SCHEMA_VERSION,
  added: { users: [], achievements: [], notifications: [], drafts: [], config: [], audit: [] },
  changed: { users: {}, achievements: {}, notifications: {}, drafts: {}, config: {}, audit: {} },
})

function seedState(): DbState {
  return {
    version: SCHEMA_VERSION,
    users: structuredClone(SEED_USERS),
    achievements: structuredClone(SEED_ACHIEVEMENTS),
    notifications: structuredClone(SEED_NOTIFICATIONS),
    drafts: [],
    config: [structuredClone(SEED_ACADEMIC_CONFIG)],
    audit: [],
  }
}

const SEED_JSON: Record<Collection, Map<string, string>> = {
  users: new Map(SEED_USERS.map((u) => [u.id, JSON.stringify(u)])),
  achievements: new Map(SEED_ACHIEVEMENTS.map((a) => [a.id, JSON.stringify(a)])),
  notifications: new Map(SEED_NOTIFICATIONS.map((n) => [n.id, JSON.stringify(n)])),
  drafts: new Map(),
  config: new Map([[SEED_ACADEMIC_CONFIG.id, JSON.stringify(SEED_ACADEMIC_CONFIG)]]),
  audit: new Map(),
}

/** Plain-text passwords recovered from Phase 1 (v1) data, waiting to be hashed. */
let legacyPasswords: { userId: string; password: string }[] = []

// ── Record validation and upgrades ───────────────────────────────────────────

const STATUSES = new Set(['submitted', 'under_review', 'needs_attention', 'verified'])
/** Phases 1–2 called the first status 'pending'; Phase 3 calls it 'submitted'. */
const upgradeStatus = (s: unknown) => (s === 'pending' ? 'submitted' : s)

function upgradeAchievement(a: Achievement): Achievement {
  return {
    ...a,
    status: upgradeStatus(a.status) as Achievement['status'],
    history: a.history.map((h) => ({ ...h, status: upgradeStatus(h.status) as Achievement['status'] })),
  }
}

const VALIDATORS: Record<Collection, (v: Record<string, unknown>) => boolean> = {
  users: (u) =>
    typeof u.username === 'string' && ['student', 'faculty', 'admin'].includes(u.role as string) && typeof u.fullName === 'string',
  achievements: (a) =>
    typeof a.studentId === 'string' &&
    typeof a.eventName === 'string' &&
    typeof a.eventDate === 'string' &&
    STATUSES.has(upgradeStatus(a.status) as string) &&
    !!a.certificate &&
    typeof a.certificate === 'object' &&
    Array.isArray(a.history) &&
    Array.isArray(a.comments),
  notifications: (n) => typeof n.userId === 'string' && typeof n.title === 'string' && typeof n.createdAt === 'string',
  drafts: (d) => typeof d.studentId === 'string' && typeof d.step === 'number' && !!d.form && typeof d.form === 'object' && typeof d.updatedAt === 'string',
  config: (c) => c.id === 'academic' && Array.isArray(c.departments) && Array.isArray(c.sections) && Array.isArray(c.categories),
  audit: (e) => typeof e.at === 'string' && typeof e.action === 'string' && typeof e.summary === 'string' && typeof e.actorId === 'string',
}

/** Keep well-formed records and drop malformed ones, rather than discarding everything. */
function clean<T extends Item>(collection: Collection, items: unknown): T[] {
  if (!Array.isArray(items)) return []
  return items
    .filter(
      (v): v is T =>
        !!v && typeof v === 'object' && typeof (v as Item).id === 'string' && VALIDATORS[collection](v as Record<string, unknown>),
    )
    .map((v) => (collection === 'achievements' ? (upgradeAchievement(v as unknown as Achievement) as unknown as T) : v))
}

// ── Overlay ↔ state ──────────────────────────────────────────────────────────

function compose(overlay: Overlay): DbState {
  const seed = seedState()
  const apply = <T extends Item>(c: Collection, base: T[]): T[] => {
    const changed = overlay.changed[c]
    const merged = base.map((item) => (changed[item.id] as T | undefined) ?? item)
    const added = (overlay.added[c] as T[]).filter((a) => !SEED_JSON[c].has(a.id))
    // New users are appended; new achievements and notifications go first (newest first).
    return c === 'users' ? [...merged, ...added] : [...added, ...merged]
  }
  return {
    version: SCHEMA_VERSION,
    users: apply('users', seed.users),
    achievements: apply('achievements', seed.achievements),
    notifications: apply('notifications', seed.notifications),
    drafts: apply('drafts', seed.drafts),
    config: apply('config', seed.config),
    audit: apply('audit', seed.audit),
  }
}

function toOverlay(st: DbState): Overlay {
  const overlay = emptyOverlay()
  for (const c of COLLECTIONS) {
    for (const item of st[c] as Item[]) {
      const seeded = SEED_JSON[c].get(item.id)
      if (seeded === undefined) overlay.added[c].push(item)
      else if (JSON.stringify(item) !== seeded) overlay.changed[c][item.id] = item
    }
  }
  return overlay
}

function parseOverlay(raw: string): Overlay | null {
  const v = JSON.parse(raw) as Partial<Overlay> | null
  if (!v || v.version !== SCHEMA_VERSION || typeof v.added !== 'object' || typeof v.changed !== 'object') return null
  const overlay = emptyOverlay()
  for (const c of COLLECTIONS) {
    overlay.added[c] = clean(c, v.added?.[c])
    const changed = v.changed?.[c]
    if (changed && typeof changed === 'object') {
      for (const item of clean(c, Object.values(changed))) {
        if (SEED_JSON[c].has(item.id)) overlay.changed[c][item.id] = item
      }
    }
  }
  return overlay
}

/** A full dataset saved by an older version (v1 or v2), cleaned and upgraded. */
function fromFullState(old: Partial<Record<Collection, unknown>>): DbState | null {
  if (!Array.isArray(old.users) || !Array.isArray(old.achievements) || !Array.isArray(old.notifications)) return null
  const seedIds = new Set(SEED_USERS.map((u) => u.id))
  // v1 stored plain-text passwords: hand them to the credential store to be hashed, then drop them.
  const users = (old.users as (User & { password?: string })[]).map(({ password, ...user }) => {
    if (password && !seedIds.has(user.id)) legacyPasswords.push({ userId: user.id, password })
    return user as User
  })
  return {
    version: SCHEMA_VERSION,
    users: clean<User>('users', users),
    achievements: clean<Achievement>('achievements', old.achievements),
    notifications: clean<AppNotification>('notifications', old.notifications),
    drafts: [],
    config: [structuredClone(SEED_ACADEMIC_CONFIG)],
    audit: [],
  }
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function load(): DbState {
  const current = readKey(STORAGE_KEY)
  if (current) {
    try {
      const overlay = parseOverlay(current)
      if (overlay) return compose(overlay)
    } catch {
      /* malformed JSON: fall through to migration / seed */
    }
  }
  for (const key of [LEGACY_KEY_V2, LEGACY_KEY_V1]) {
    const raw = readKey(key)
    if (!raw) continue
    removeKey(key)
    try {
      const migrated = fromFullState(JSON.parse(raw))
      if (migrated) return compose(toOverlay(migrated))
    } catch {
      /* unreadable: try the next format */
    }
  }
  return seedState()
}

let state: DbState = load()
const listeners = new Set<() => void>()
persist()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toOverlay(state)))
  } catch {
    // Quota exceeded or storage unavailable: drop inline previews and retry once.
    try {
      const slim: DbState = {
        ...state,
        achievements: state.achievements.map((a) => ({ ...a, certificate: { ...a.certificate, previewDataUrl: undefined } })),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toOverlay(slim)))
    } catch {
      /* The prototype keeps working in memory. */
    }
  }
}

export function getState(): DbState {
  return state
}

export function setState(updater: (prev: DbState) => DbState) {
  state = updater(state)
  persist()
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const resetListeners = new Set<() => void>()
/** Lets other prototype stores (e.g. credentials) reset alongside the dataset. */
export function onDemoReset(listener: () => void) {
  resetListeners.add(listener)
}

/** Discard every change made in this browser and return to the seed data. */
export function resetDemoData() {
  state = seedState()
  persist()
  resetListeners.forEach((l) => l())
  listeners.forEach((l) => l())
}

/** One-time hand-off of migrated Phase 1 passwords. Returns them once, then forgets them. */
export function takeLegacyPasswords() {
  const out = legacyPasswords
  legacyPasswords = []
  return out
}

/** Subscribe a component to a slice of the store. Selectors must return stable references. */
export function useStore<T>(selector: (s: DbState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

/** Simulated network latency so loading states are exercised. */
export function delay(ms = 350) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
