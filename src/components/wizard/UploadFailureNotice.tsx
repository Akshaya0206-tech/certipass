import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'

/**
 * Shown on the review step when the certificate could not be uploaded to
 * storage. Nothing has been submitted at that point, and Retry reuses the same
 * upload reference, so retrying can never store the file twice.
 */
export function UploadFailureNotice({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="mt-6 rounded-md border border-terracotta-300 bg-terracotta-50 px-4 py-3.5 text-sm">
      <p className="flex items-center gap-2 font-medium text-terracotta-700">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        Your certificate was not uploaded
      </p>
      <p className="mt-1 text-ink-soft">{message}</p>
      <p className="mt-1 text-[12.5px] text-ink-muted">Nothing has been submitted yet, and your answers are kept.</p>
      <Button size="sm" className="mt-3" onClick={onRetry} loading={retrying} icon={<RefreshCw className="size-3.5" aria-hidden />}>
        {retrying ? 'Retrying…' : 'Retry upload'}
      </Button>
    </div>
  )
}
