import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, FileImage, FileText, Trash2, UploadCloud } from 'lucide-react'
import { formatBytes } from '../../lib/format'
import { ALLOWED_TYPES, MAX_FILES, MAX_FILE_BYTES, checkFile, deleteFile, putFile } from '../../services/fileStore'
import type { OdDocument } from '../../types'

interface Pending {
  id: string
  name: string
  size: number
  type: string
  progress: number
}

interface Props {
  value: OdDocument[]
  onChange: (docs: OdDocument[]) => void
  error?: string
}

export function FileUpload({ value, onChange, error }: Props) {
  const inputId = useId()
  const [pending, setPending] = useState<Pending[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  const slotsLeft = MAX_FILES - value.length - pending.length

  function start(files: FileList | File[]) {
    const list = Array.from(files)
    const errs: string[] = []
    const accepted: File[] = []
    for (const f of list) {
      const bad = checkFile(f)
      if (bad) errs.push(bad)
      else if (accepted.length >= slotsLeft) errs.push(`${f.name}: you can attach at most ${MAX_FILES} files.`)
      else accepted.push(f)
    }
    setProblems(errs)
    accepted.forEach(upload)
  }

  /** The browser has no server to send the file to, so progress is simulated while the file is stored locally. */
  function upload(file: File) {
    const id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    setPending((p) => [...p, { id, name: file.name, size: file.size, type: file.type, progress: 0 }])
    let progress = 0
    const timer = window.setInterval(() => {
      progress = Math.min(progress + 20, 90)
      setPending((p) => p.map((x) => (x.id === id ? { ...x, progress } : x)))
    }, 120)
    putFile(id, file).then((ok) => {
      window.clearInterval(timer)
      window.setTimeout(() => {
        setPending((p) => p.filter((x) => x.id !== id))
        if (!ok) {
          setProblems((e) => [...e, `${file.name}: the browser could not store this file. Try a smaller file.`])
          return
        }
        onChange([...latest.current, { id, name: file.name, type: file.type, size: file.size, hasContent: true }])
      }, 700)
    })
  }

  function remove(doc: OdDocument) {
    void deleteFile(doc.id)
    onChange(value.filter((d) => d.id !== doc.id))
  }

  const full = slotsLeft <= 0

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!full) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!full) start(e.dataTransfer.files)
        }}
        className={`rounded-md border-2 border-dashed p-5 text-center transition-colors ${
          dragging ? 'border-gold-dark bg-gold-50' : error ? 'border-red-fg bg-red-bg/40' : 'border-line-strong bg-lavender'
        }`}
      >
        <UploadCloud className="mx-auto size-8 text-purple-500" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-ink">
          <label htmlFor={inputId} className={`${full ? 'text-ink-muted' : 'cursor-pointer text-purple underline underline-offset-2'}`}>
            Choose files
          </label>
          <span className="font-normal text-ink-soft"> or drag them here</span>
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {Object.values(ALLOWED_TYPES).join(', ')} · up to {formatBytes(MAX_FILE_BYTES)} each · maximum {MAX_FILES} files
        </p>
        <input
          id={inputId}
          type="file"
          multiple
          disabled={full}
          accept={Object.keys(ALLOWED_TYPES).join(',')}
          className="sr-only"
          aria-describedby={error ? `${inputId}-err` : undefined}
          onChange={(e) => {
            if (e.target.files) start(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">Prototype: files stay in this browser and are not sent to any college system.</p>

      {error && (
        <p id={`${inputId}-err`} role="alert" className="mt-1 flex items-start gap-1 text-xs font-medium text-red-fg">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1 text-xs font-medium text-red-fg">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      )}

      {(value.length > 0 || pending.length > 0) && (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-white">
          {value.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              {d.type.startsWith('image/') ? <FileImage className="size-5 shrink-0 text-purple-500" aria-hidden /> : <FileText className="size-5 shrink-0 text-purple-500" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                <p className="text-xs text-ink-muted">
                  {ALLOWED_TYPES[d.type] ?? 'File'} · {formatBytes(d.size)}
                </p>
              </div>
              <button type="button" onClick={() => remove(d)} className="inline-flex size-9 items-center justify-center rounded-md text-red-fg hover:bg-red-bg" aria-label={`Remove ${d.name}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-ink">{p.name}</span>
                <span className="text-xs text-ink-muted tabular-nums">{p.progress}%</span>
              </div>
              <div role="progressbar" aria-label={`Uploading ${p.name}`} aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-lavender-deep">
                <div className="h-full bg-purple transition-[width]" style={{ width: `${p.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
