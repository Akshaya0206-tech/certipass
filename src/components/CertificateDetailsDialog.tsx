import { batchLabel } from '../domain/batch'
import { formatDate } from '../lib/format'
import { formatBytes } from '../services/fileService'
import type { ListedCertificate } from '../services/certificateStorage'
import type { CertificateFile, CertificateFileType } from '../types'
import { CertificatePreview } from './CertificatePreview'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

/** What the preview needs to fetch the file through the authenticated storage API. */
export const asStoredFile = (c: ListedCertificate): CertificateFile => ({
  fileName: c.fileName,
  fileType: c.mimeType as CertificateFileType,
  sizeBytes: c.sizeBytes,
  storage: { provider: 'drive', certificateId: c.id },
})

export const certificateName = (c: Pick<ListedCertificate, 'title' | 'fileName'>) => c.title || c.fileName

/**
 * One certificate in a modal: its details, then the real file (fetched through the storage API, never from a public
 * link) with Open-in-new-tab and Download. `showStudent` adds who it belongs to, for faculty and administrators.
 */
export function CertificateDetailsDialog({ item, showStudent, onClose }: { item: ListedCertificate | null; showStudent: boolean; onClose: () => void }) {
  const rows: [string, string][] = item
    ? [
        ...(showStudent
          ? ([
              ['Student', item.studentName],
              ['Student ID', item.registerNumber],
              ['Department', item.department || '—'],
              ['Batch', batchLabel(item.batch)],
            ] as [string, string][])
          : []),
        ['Category', item.category ?? '—'],
        ['Issuing organisation', item.issuer || '—'],
        ['Issue date', item.issueDate ? formatDate(item.issueDate) : '—'],
        ['Uploaded', item.uploadedAt ? formatDate(item.uploadedAt) : '—'],
        ['File', `${item.fileName} · ${formatBytes(item.sizeBytes)}`],
      ]
    : []
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      size="lg"
      title={item ? certificateName(item) : 'Certificate'}
      description={item && showStudent ? `${item.studentName} · ${item.registerNumber}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {item && (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line bg-ivory px-4 py-3 text-[13px] sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="label-archival text-[10px]">{k}</dt>
                <dd className="truncate font-medium text-navy-900" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <CertificatePreview certificate={asStoredFile(item)} eventName={certificateName(item)} />
        </>
      )}
    </Dialog>
  )
}
