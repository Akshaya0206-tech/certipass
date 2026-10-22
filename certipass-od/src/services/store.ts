/**
 * Local persistence for the prototype. This stands in for a backend database:
 * the whole state lives in localStorage and is read and written only through
 * the service modules, never directly by pages.
 */
import { buildSeedState } from '../data/seed'
import type { AppState } from '../types'

const KEY = 'rec-od-demo-state'
const SESSION_KEY = 'rec-od-demo-session'
const VERSION = 1

let state: AppState | null = null
const listeners = new Set<() => void>()

function persist(next: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage may be full or blocked; the in-memory state still works for this tab.
  }
}

export async function initStore(): Promise<void> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      if (parsed.version === VERSION) {
        state = parsed
        return
      }
    }
  } catch {
    // Fall through to a fresh seed.
  }
  state = await buildSeedState()
  persist(state)
}

export function getState(): AppState {
  if (!state) throw new Error('Store not initialised')
  return state
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Apply a change to a copy of the state, persist it and notify subscribers. */
export function mutate<T>(fn: (draft: AppState) => T): T {
  const draft = structuredClone(getState())
  const result = fn(draft)
  state = draft
  persist(draft)
  listeners.forEach((l) => l())
  return result
}

export async function resetDemoData(): Promise<void> {
  state = await buildSeedState()
  persist(state)
  try {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

export const sessionKey = SESSION_KEY
