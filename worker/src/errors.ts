/*
 * One error type for everything the API refuses or fails at. `code` is the
 * stable, machine-readable reason the frontend switches on; `message` is safe
 * to show a person and never contains a credential, a Drive id or a stack.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** True when trying the same request again could succeed. */
  readonly retryable: boolean
  /** Extra, non-secret facts for the client: which `field` is wrong, which `portal` to use, `retryAfterSeconds`… */
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, message: string, retryable = false, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.extra = extra
  }
}

/** A 400 about one field of a form, so the screen can mark that field. */
export const invalidField = (field: string, message: string) => new ApiError(400, 'invalid_input', message, false, { field })

/** A failure talking to Google Drive, classified so callers can decide what to do next. */
export class DriveError extends Error {
  readonly code: DriveErrorCode
  readonly retryable: boolean

  constructor(code: DriveErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'DriveError'
    this.code = code
    this.retryable = retryable
  }
}

export type DriveErrorCode =
  | 'drive_not_configured'
  | 'drive_auth_failed'
  | 'drive_folder_inaccessible'
  | 'drive_folder_missing'
  | 'drive_folder_public'
  | 'drive_quota'
  | 'drive_rate_limited'
  | 'drive_file_missing'
  | 'drive_unavailable'

/** The HTTP shape a Drive failure takes when it reaches a client. */
export function driveErrorToApi(err: DriveError): ApiError {
  switch (err.code) {
    case 'drive_not_configured':
      return new ApiError(503, err.code, 'Certificate storage has not been set up yet. Ask the records office to finish the Google Drive setup.')
    case 'drive_auth_failed':
      return new ApiError(503, err.code, 'Certificate storage could not sign in to Google Drive. The records office needs to re-authorise it.')
    case 'drive_folder_inaccessible':
      return new ApiError(503, err.code, 'The certificate folder in Google Drive cannot be accessed. The records office needs to check the folder’s sharing permissions.')
    case 'drive_folder_public':
      return new ApiError(
        503,
        err.code,
        'The certificate folder in Google Drive is open to anyone with its link, so certificates would not be private. The records office needs to set its sharing to Restricted before uploads can continue.',
      )
    case 'drive_folder_missing':
      return new ApiError(503, err.code, 'A certificate folder in Google Drive is missing. Try again in a moment.', true)
    case 'drive_quota':
      return new ApiError(507, err.code, 'The Google Drive storage is full or the account cannot add files. The records office needs to resolve this.')
    case 'drive_rate_limited':
      return new ApiError(429, err.code, 'Google Drive is busy. Wait a few seconds and try again.', true)
    case 'drive_file_missing':
      return new ApiError(404, 'certificate_not_available', 'This certificate file is no longer in storage.')
    default:
      return new ApiError(503, 'drive_unavailable', 'Google Drive could not be reached. Your certificate was not lost — try again in a moment.', true)
  }
}
