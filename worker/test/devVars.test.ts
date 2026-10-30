import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDevVar } from '../scripts/devVars'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'devvars-'))
  file = join(dir, '.dev.vars')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const read = () => readFileSync(file, 'utf8')

describe('setDevVar', () => {
  it('fills an empty value and leaves every other line alone', () => {
    const before = '# keep me\nGOOGLE_OAUTH_CLIENT_ID=abc\nGOOGLE_OAUTH_CLIENT_SECRET=shh\nGOOGLE_OAUTH_REFRESH_TOKEN=\n\nAUTH_PEPPER=\nALLOWED_ORIGINS=http://localhost:5173\n'
    writeFileSync(file, before)
    setDevVar('GOOGLE_OAUTH_REFRESH_TOKEN', 'new-token', file)
    expect(read()).toBe(before.replace('GOOGLE_OAUTH_REFRESH_TOKEN=\n', 'GOOGLE_OAUTH_REFRESH_TOKEN=new-token\n'))
  })

  it('replaces an existing token', () => {
    writeFileSync(file, 'A=1\nGOOGLE_OAUTH_REFRESH_TOKEN=old\nB=2\n')
    setDevVar('GOOGLE_OAUTH_REFRESH_TOKEN', 'new', file)
    expect(read()).toBe('A=1\nGOOGLE_OAUTH_REFRESH_TOKEN=new\nB=2\n')
  })

  it('keeps Windows line endings', () => {
    writeFileSync(file, 'A=1\r\nGOOGLE_OAUTH_REFRESH_TOKEN=\r\nB=2\r\n')
    setDevVar('GOOGLE_OAUTH_REFRESH_TOKEN', 'new', file)
    expect(read()).toBe('A=1\r\nGOOGLE_OAUTH_REFRESH_TOKEN=new\r\nB=2\r\n')
  })

  it('appends the key when it is missing, with or without a final newline', () => {
    writeFileSync(file, 'A=1\n')
    setDevVar('X', 'v', file)
    expect(read()).toBe('A=1\nX=v\n')
    writeFileSync(file, 'A=1')
    setDevVar('X', 'v', file)
    expect(read()).toBe('A=1\nX=v\n')
  })

  it('creates the file when there is none', () => {
    setDevVar('X', 'v', file)
    expect(read()).toBe('X=v\n')
  })

  it('does not touch a commented-out line, and updates every active duplicate', () => {
    writeFileSync(file, '# GOOGLE_OAUTH_REFRESH_TOKEN=commented\nGOOGLE_OAUTH_REFRESH_TOKEN=one\nGOOGLE_OAUTH_REFRESH_TOKEN=two\n')
    setDevVar('GOOGLE_OAUTH_REFRESH_TOKEN', 'new', file)
    expect(read()).toBe('# GOOGLE_OAUTH_REFRESH_TOKEN=commented\nGOOGLE_OAUTH_REFRESH_TOKEN=new\nGOOGLE_OAUTH_REFRESH_TOKEN=new\n')
  })

  it('does not treat a longer name that starts with the key as the key', () => {
    writeFileSync(file, 'GOOGLE_OAUTH_REFRESH_TOKEN_OLD=keep\n')
    setDevVar('GOOGLE_OAUTH_REFRESH_TOKEN', 'new', file)
    expect(read()).toBe('GOOGLE_OAUTH_REFRESH_TOKEN_OLD=keep\nGOOGLE_OAUTH_REFRESH_TOKEN=new\n')
  })

  it('refuses a bad name or a value that would inject another line', () => {
    writeFileSync(file, 'A=1\n')
    expect(() => setDevVar('bad key', 'v', file)).toThrow()
    expect(() => setDevVar('X', 'v\nAUTH_PEPPER=evil', file)).toThrow()
    expect(read()).toBe('A=1\n')
  })
})
