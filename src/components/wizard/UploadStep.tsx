import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Check, FileText, ImageIcon, Info, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ACCEPTED_LABEL, ACCEPTED_TYPES, ACCEPT_ATTRIBUTE, FILE_RULES, formatBytes } from '../../services/fileService'
import type { CertificateFile, CertificateFileType } from '../../types'
import { CertificatePreview } from '../CertificatePreview'
import { Button } from '../ui/Button'
import { InlineError } from './WizardSteps'

/** A file held in browser memory for this visit only. */
export interface SelectedFile {
  file: File
  type: CertificateFileType
  /** Temporary object URL; the wizard revokes it when the file changes or the page closes. */
  objectUrl: string
}

interface UploadStepProps {
  selected: SelectedFile | null
  /** True while the chosen file is being read and checked on this device. */
  checking: boolean
  error?: string
  onChoose: (file: File | undefined) => void
  onRemove: () => void
  eventName: string
  /** Resubmission: the certificate already on the record, kept unless replaced. */
  existing?: CertificateFile
  /** A file named in a saved draft that could not be restored. */
  missingFromDraft?: Pick<CertificateFile, 'fileName' | 'sizeBytes'>
}

export function UploadStep({ selected, checking, error, onChoose, onRemove, eventName, existing, missingFromDraft }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const browse = () => inputRef.current?.click()

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (checking) return
    onChoose(e.dataTransfer.files?.[0])
  }

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        id="certificate-file"
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label="Certificate file"
        aria-describedby="file-help"
        onChange={(e) => {
          onChoose(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {missingFromDraft && !selected && (
        <p className="flex items-start gap-2.5 rounded-md border border-lavender-200 bg-lavender-50 px-4 py-3 text-[13px] text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-lavender-700" aria-hidden />
          <span>
            When you saved this draft you had selected <span className="font-mono text-ink">{missingFromDraft.fileName}</span> ({formatBytes(missingFromDraft.sizeBytes)}). Files
            can’t be kept in a draft, so please select it again.
          </span>
        </p>
      )}

      {existing && !selected && (
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="label-archival mb-3">Current certificate — kept unless you replace it</p>
          <CertificatePreview certificate={existing} eventName={eventName} />
        </div>
      )}

      {checking ? (
        <div role="status" className="flex flex-col items-center rounded-xl border border-line bg-parchment/40 px-6 py-10 text-center">
          <Loader2 className="size-7 animate-spin text-navy-700" aria-hidden />
          <p className="mt-3 font-medium text-navy-900">Checking the file on this device…</p>
          <p className="mt-1 text-[13px] text-ink-muted">Reading its type and size. Nothing is being uploaded.</p>
          <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-parchment-deep" aria-hidden>
            <div className="h-full w-1/2 animate-pulse rounded-full bg-navy-700" />
          </div>
        </div>
      ) : !selected ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center rounded-md border-2 border-dashed px-6 text-center transition-colors',
            existing ? 'py-7' : 'py-12',
            dragging ? 'border-navy-700 bg-lavender-50' : error ? 'border-terracotta-300 bg-terracotta-50/40' : 'border-line-strong bg-parchment/40',
          )}
        >
          <UploadCloud className={cn('size-9', dragging ? 'text-navy-800' : 'text-ink-muted')} strokeWidth={1.4} aria-hidden />
          <p className="mt-4 font-medium text-navy-900">{existing ? 'Drop a replacement certificate here' : 'Drag and drop your certificate here'}</p>
          <p id="file-help" className="mt-1 text-sm text-ink-muted">
            {ACCEPTED_LABEL} · up to {formatBytes(FILE_RULES.maxBytes)}
          </p>
          <Button variant="secondary" className="mt-5" onClick={browse}>
            {existing ? 'Replace Certificate' : 'Browse Files'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-white p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded bg-lavender-100 text-lavender-700">
            {selected.type === 'application/pdf' ? <FileText className="size-5" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate font-medium text-navy-900">{selected.file.name}</p>
            <p className="text-[12.5px] text-ink-muted">
              {ACCEPTED_TYPES[selected.type]} · {formatBytes(selected.file.size)} ·{' '}
              <span className="whitespace-nowrap text-navy-800">
                <Check className="inline size-3" aria-hidden /> Valid file
              </span>
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={browse}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove} icon={<Trash2 className="size-4" aria-hidden />}>
              Remove
            </Button>
          </div>
        </div>
      )}

      <InlineError message={error} />

      {selected && !checking && (
        <div>
          <p className="label-archival mb-2">Preview</p>
          <CertificatePreview
            certificate={{ fileName: selected.file.name, fileType: selected.type, sizeBytes: selected.file.size }}
            eventName={eventName || 'this achievement'}
            objectUrl={selected.objectUrl}
            showMeta={false}
          />
        </div>
      )}

      <p className="text-[12px] text-ink-muted">
        Prototype note: the file stays in this browser tab for preview and checking. It is not uploaded or stored, and the checks here don’t replace server-side scanning.
      </p>
    </div>
  )
}
