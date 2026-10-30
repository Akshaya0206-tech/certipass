import { CircleAlert, ExternalLink, FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import { useStorageStatus } from '../../hooks/useStorageStatus'
import { driveFolderUrl, UNAVAILABLE_COPY } from '../../services/certificateStorage'
import { ACCEPTED_TYPES, MAX_FILE_BYTES, formatBytes } from '../../services/fileService'
import { Button, buttonClasses } from '../ui/Button'

/** The link to open: the storage service's (admins only), else the one configured at build time. */
function useFolderUrl(): string | undefined {
  const { state } = useStorageStatus()
  return (state.status === 'loaded' ? state.value.folderUrl : undefined) ?? driveFolderUrl()
}

/**
 * "Open Google Drive Folder" for the Achievement Records page. Google decides
 * who can actually open the folder: only accounts it is shared with.
 */
export function OpenDriveFolderButton() {
  const url = useFolderUrl()
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses('secondary')}>
      <FolderOpen className="size-4" aria-hidden />
      Open Google Drive Folder
      <ExternalLink className="size-3.5 text-ink-muted" aria-hidden />
    </a>
  )
}

/** The Settings panel for certificate storage: what is connected, whether it is healthy, and a way into Drive. */
export function DriveStorageSettings() {
  const { state, reload } = useStorageStatus()
  const url = (state.status === 'loaded' ? state.value.folderUrl : undefined) ?? driveFolderUrl()
  const rules = `Accepted formats: ${Object.values(ACCEPTED_TYPES).join(', ')}. Maximum size: ${formatBytes(MAX_FILE_BYTES)}. Files are checked in the browser and again on the server.`

  return (
    <div>
      <h2 className="font-medium text-navy-900">Certificate files</h2>
      <p className="mt-1 text-sm text-ink-soft">{rules}</p>

      {state.status === 'unavailable' && (
        <div className="mt-3 rounded-md border border-line bg-parchment/50 px-4 py-3 text-sm" role="status">
          <p className="font-medium text-navy-900">{UNAVAILABLE_COPY[state.reason].title}</p>
          <p className="mt-1 text-ink-soft">{UNAVAILABLE_COPY[state.reason].reason}</p>
        </div>
      )}

      {state.status === 'loading' && (
        <p role="status" aria-busy="true" className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking the Google Drive folder…
        </p>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mt-3 rounded-md border border-terracotta-300 bg-terracotta-50 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-terracotta-700">
            <CircleAlert className="size-4" aria-hidden /> Couldn’t check certificate storage
          </p>
          <p className="mt-1 text-ink-soft">{state.error.message}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={reload} icon={<RefreshCw className="size-3.5" aria-hidden />}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'loaded' && (
        <div className={state.value.ok ? 'mt-3 rounded-md border border-line bg-ivory px-4 py-3 text-sm' : 'mt-3 rounded-md border border-terracotta-300 bg-terracotta-50 px-4 py-3 text-sm'} role={state.value.ok ? 'status' : 'alert'}>
          <p className={state.value.ok ? 'font-medium text-navy-900' : 'flex items-center gap-2 font-medium text-terracotta-700'}>
            {!state.value.ok && <CircleAlert className="size-4" aria-hidden />}
            {state.value.ok ? 'Google Drive folder connected' : 'Uploads need attention'}
            {state.value.folderName && <span className="font-normal text-ink-soft"> · “{state.value.folderName}” ({state.value.inSharedDrive ? 'Shared drive' : 'My Drive'})</span>}
          </p>
          <p className="mt-1 text-ink-soft">{state.value.message}</p>
          {state.value.ok && state.value.publiclyShared === undefined && (
            <p className="mt-2 text-[12.5px] text-ink-muted">Google didn’t say who the folder is shared with. Open it in Drive and make sure General access is “Restricted”.</p>
          )}
        </div>
      )}

      {url && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary')}>
            <FolderOpen className="size-4" aria-hidden />
            Open Google Drive Folder
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <p className="max-w-md text-[12.5px] text-ink-muted">
            Uploaded certificates are stored in this folder, in batch → department → register number → category folders. Only Google accounts the folder is shared with can open it.
          </p>
        </div>
      )}
    </div>
  )
}
