/*
 * A stand-in for Cloudflare D1 backed by real SQLite (Node's built-in `node:sqlite`), so the tests run the Worker's
 * actual SQL and the real migration files, constraints, indexes and transactions included. It can also be told to fail
 * on demand, to rehearse a database outage.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { D1Like, D1Result, D1Statement } from '../src/types'

export interface SqlCall {
  sql: string
  kind: 'first' | 'all' | 'run' | 'batch'
}

const MIGRATIONS = resolve(import.meta.dirname, '../migrations')
export const migrationSql = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(MIGRATIONS, f), 'utf8'))

type Param = null | number | bigint | string

export class TestD1 implements D1Like {
  readonly sqlite = new DatabaseSync(':memory:')
  /** Every statement executed, in order (tests use this to prove "nothing reached the database"). */
  calls: SqlCall[] = []
  private failures: { match: (c: SqlCall) => boolean; times: number }[] = []

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON')
    for (const sql of migrationSql()) this.sqlite.exec(sql)
  }

  /** Make the next `times` matching statements fail the way a database outage would. */
  failNext(match: (c: SqlCall) => boolean, times = 1) {
    this.failures.push({ match, times })
  }

  /** Records a call and throws if a test asked for it to fail. */
  intercept(call: SqlCall) {
    this.calls.push(call)
    for (const f of this.failures) {
      if (f.times > 0 && f.match(call)) {
        f.times--
        throw new Error('D1_ERROR: injected failure: network connection lost')
      }
    }
  }

  prepare(sql: string): D1Statement {
    return new TestStatement(this, sql, [])
  }

  async batch(statements: D1Statement[]): Promise<D1Result<unknown>[]> {
    this.intercept({ sql: statements.map((s) => (s as TestStatement).sql).join('; '), kind: 'batch' })
    this.sqlite.exec('BEGIN')
    try {
      const out: D1Result<unknown>[] = []
      for (const s of statements) out.push((s as TestStatement).execute())
      this.sqlite.exec('COMMIT')
      return out
    } catch (err) {
      this.sqlite.exec('ROLLBACK')
      throw err
    }
  }

  /** Test helper: read rows directly, outside the Worker. */
  rows<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
    return this.sqlite.prepare(sql).all(...params) as T[]
  }
  /** Test helper: change data directly, outside the Worker. */
  exec(sql: string, ...params: Param[]) {
    this.sqlite.prepare(sql).run(...params)
  }
}

class TestStatement implements D1Statement {
  constructor(
    private readonly db: TestD1,
    readonly sql: string,
    private readonly params: Param[],
  ) {}

  bind(...values: unknown[]): D1Statement {
    // Real D1 refuses `undefined`; so does this, so a missing value is caught by the tests and not in production.
    for (const v of values) if (v === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'")
    return new TestStatement(this.db, this.sql, values as Param[])
  }

  /** Real D1 reports a failed statement as an error whose message starts with D1_ERROR. */
  execute(): D1Result<never> {
    try {
      const stmt = this.db.sqlite.prepare(this.sql)
      const returnsRows = /^\s*(select|with)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql)
      if (returnsRows) {
        const results = stmt.all(...this.params) as never[]
        return { results, meta: { changes: /\breturning\b/i.test(this.sql) ? results.length : 0 } }
      }
      return { results: [], meta: { changes: Number(stmt.run(...this.params).changes) } }
    } catch (err) {
      throw new Error(`D1_ERROR: ${err instanceof Error ? err.message : err}: SQLITE_ERROR`)
    }
  }

  async first<T>(): Promise<T | null> {
    this.db.intercept({ sql: this.sql, kind: 'first' })
    return (this.execute().results[0] as T) ?? null
  }

  async all<T>(): Promise<D1Result<T>> {
    this.db.intercept({ sql: this.sql, kind: 'all' })
    return this.execute() as unknown as D1Result<T>
  }

  async run(): Promise<D1Result<never>> {
    this.db.intercept({ sql: this.sql, kind: 'run' })
    return this.execute()
  }
}
