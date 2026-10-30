import type { Db } from './db'
import type { DriveClient } from './drive'
import type { Deps, Env } from './types'

/** Everything a request handler needs: settings, the clock and fetch, the database and Google Drive. */
export interface Ctx {
  env: Env
  deps: Deps
  db: Db
  drive: DriveClient
}
