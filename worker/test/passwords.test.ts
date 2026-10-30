import { describe, expect, it } from 'vitest'
import { constantTimeEqual, decoyHash, hashPassword, newSessionToken, passwordProblem, sha256Text, verifyPassword } from '../src/passwords'

const PEPPER = 'a-long-secret-pepper-for-the-tests-0123456789'
const ROUNDS = 1000

describe('hashing', () => {
  it('stores the algorithm, the rounds, a salt and a hash, and never the password', async () => {
    const stored = await hashPassword('Passw0rd!', PEPPER, ROUNDS)
    const [alg, rounds, salt, hash] = stored.split('$')
    expect(alg).toBe('pbkdf2-sha256')
    expect(rounds).toBe(String(ROUNDS))
    expect(salt.length).toBeGreaterThanOrEqual(20)
    expect(hash.length).toBeGreaterThanOrEqual(40)
    expect(stored).not.toContain('Passw0rd!')
  })

  it('gives the same password a different hash each time (random salt)', async () => {
    expect(await hashPassword('Passw0rd!', PEPPER, ROUNDS)).not.toBe(await hashPassword('Passw0rd!', PEPPER, ROUNDS))
  })

  it('accepts the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('Passw0rd!', PEPPER, ROUNDS)
    expect(await verifyPassword('Passw0rd!', stored, PEPPER)).toBe(true)
    for (const wrong of ['passw0rd!', 'Passw0rd', 'Passw0rd!!', '', ' Passw0rd!']) expect(await verifyPassword(wrong, stored, PEPPER)).toBe(false)
  })

  it('is useless without the pepper: a database leak alone cannot confirm a guess', async () => {
    const stored = await hashPassword('Passw0rd!', PEPPER, ROUNDS)
    expect(await verifyPassword('Passw0rd!', stored, 'a-different-pepper-a-different-pepper-0123')).toBe(false)
  })

  it('reads the number of rounds from the stored hash, so it can be raised later without locking anyone out', async () => {
    const old = await hashPassword('Passw0rd!', PEPPER, 500)
    expect(await verifyPassword('Passw0rd!', old, PEPPER)).toBe(true)
  })

  it('treats a damaged stored value as "wrong password", never as an error', async () => {
    for (const bad of ['', 'plaintext', 'pbkdf2-sha256$abc$x$y', 'pbkdf2-sha256$0$x$y', 'pbkdf2-sha256$99999999$x$y', 'md5$1000$aaaa$bbbb', 'pbkdf2-sha256$1000$$']) {
      expect(await verifyPassword('Passw0rd!', bad, PEPPER)).toBe(false)
    }
  })

  it('has a decoy hash nobody can match, so a missing account takes as long as a wrong password', async () => {
    const decoy = await decoyHash(PEPPER, ROUNDS)
    expect(decoy.startsWith('pbkdf2-sha256$')).toBe(true)
    for (const guess of ['Passw0rd!', 'password', '']) expect(await verifyPassword(guess, decoy, PEPPER)).toBe(false)
  })
})

describe('constant-time comparison', () => {
  it('compares bytes exactly', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false)
  })
})

describe('the password policy', () => {
  it('accepts a password with 8+ characters, upper and lower case, and a digit', () => {
    expect(passwordProblem('Passw0rd')).toBeNull()
    expect(passwordProblem('Correct-Horse-9')).toBeNull()
  })

  it.each([
    ['', /Enter/],
    ['Sh0rt', /8 characters/],
    ['alllowercase1', /upper and lower/],
    ['ALLUPPERCASE1', /upper and lower/],
    ['NoDigitsHere', /number/],
    ['A1a'.repeat(50), /128/],
  ])('refuses %j', (password, message) => {
    expect(passwordProblem(password)).toMatch(message)
  })

  it('refuses things that are not strings', () => {
    for (const bad of [undefined, null, 12345678, ['Passw0rd1'], { length: 12 }]) expect(passwordProblem(bad)).not.toBeNull()
  })
})

describe('session tokens', () => {
  it('are long, URL-safe and never repeat', () => {
    const tokens = new Set(Array.from({ length: 50 }, newSessionToken))
    expect(tokens.size).toBe(50)
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('are stored as a one-way hash', async () => {
    const hash = await sha256Text('abc')
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
