/* Reads worker/.dev.vars (KEY=value lines) into an Env-shaped object. Real environment variables win. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Env } from '../src/types'

export const DEV_VARS_PATH = resolve(import.meta.dirname, '../.dev.vars')

export function loadEnv(): Env {
  const values: Record<string, string> = {}
  if (existsSync(DEV_VARS_PATH)) {
    for (const line of readFileSync(DEV_VARS_PATH, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (!m || line.trimStart().startsWith('#')) continue
      values[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2')
    }
  }
  return { ...values, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('GOOGLE_') || k === 'AUTH_PEPPER' || k === 'SETUP_TOKEN')) } as unknown as Env
}

/**
 * Sets one KEY=value line in .dev.vars and leaves every other line (values, comments, blank lines, line endings) exactly as it was.
 * Every active line for the key is updated, because loadEnv() lets the last one win. A missing key is appended.
 */
export function setDevVar(key: string, value: string, path = DEV_VARS_PATH): void {
  if (!/^[A-Z0-9_]+$/.test(key)) throw new Error('Invalid variable name.')
  if (/[\r\n]/.test(value)) throw new Error('A value cannot contain a line break.')
  const original = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const keyLine = new RegExp(`^\\s*${key}\\s*=`)
  let found = false
  const lines = original.split(/\r?\n/).map((line) => {
    if (line.trimStart().startsWith('#') || !keyLine.test(line)) return line
    found = true
    return `${key}=${value}`
  })
  if (!found) {
    if (lines[lines.length - 1] === '') lines.pop()
    lines.push(`${key}=${value}`, '')
  }
  writeFileSync(path, lines.join(eol))
}
