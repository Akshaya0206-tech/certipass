import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ExternalLink, FileImage, FileText, FileX2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { ACCEPTED_TYPES, formatBytes } from '../services/fileService'
import type { CertificateFile } from '../types'

/** A viewable source for the certificate, if the prototype has one. */
export function certificateSource(certificate: CertificateFile | null | undefined, objectUrl?: string): string | undefined {
  return objectUrl ?? certificate?.previewDataUrl ?? certificate?.previewUrl
}

/** True when a record has certificate metadata at all (a file name and a known type). */
export function hasCertificate(certificate: CertificateFile | null | undefined): certificate is CertificateFile {
  return !!certificate && typeof certificate.fileName === 'string' && certificate.fileName !== '' && certificate.fileType in ACCEPTED_TYPES
}

interface CertificatePreviewProps {
  /** May be missing on a damaged or incomplete record; a "no certificate" state is shown then. */
  certificate: CertificateFile | null | undefined
  /** Used for alt text. */
  eventName: string
  /** A live object URL for a file selected in this session. */
  objectUrl?: string
  className?: string
  showMeta?: boolean
  /** Id for the preview region, so other controls can link to it. */
  id?: string
}

/**
 * Shows the certificate when the prototype actually has the file — a bundled
 * demo asset, a small image uploaded in this browser, or a file selected in
 * this session. Otherwise it says plainly that no preview is available; it
 * never invents a document or offers a download that doesn't exist.
 */
export function CertificatePreview({ certificate, eventName, objectUrl, className, showMeta = true, id }: CertificatePreviewProps) {
  const [failed, setFailed] = useState(false)
  const present = hasCertificate(certificate)
  const isPdf = present && certificate.fileType === 'application/pdf'
  const src = present ? certificateSource(certificate, objectUrl) : undefined
  // Only bundled demo assets get an "open" link. In-memory files (blob: / data:) are
  // temporary previews, not stored documents, so no link is offered for them.
  const openable = src && !src.startsWith('data:') && !src.startsWith('blob:')

  // A new file gets a fresh chance to render.
  useEffect(() => setFailed(false), [src])

  if (!present) {
    return (
      <figure id={id} className={cn('flex flex-col gap-3', className)}>
        <div className="overflow-hidden rounded-md border border-terracotta-300 bg-terracotta-50/50 p-3 sm:p-4">
          <Unavailable title="No certificate attached" reason="This record has no certificate file or file details. It can’t be verified until the student provides one." />
        </div>
      </figure>
    )
  }

  return (
    <figure id={id} className={cn('flex flex-col gap-3', className)}>
      <div className="overflow-hidden rounded-xl border border-line bg-parchment-deep/50 p-3 sm:p-4">
        {src && !failed ? (
          isPdf ? (
            <object data={src} type="application/pdf" className="h-[460px] w-full rounded-sm bg-white" aria-label={`PDF certificate for ${eventName}`}>
              <Unavailable reason="This browser can’t display PDFs inline." action={openable ? <OpenLink href={src} /> : undefined} />
            </object>
          ) : (
            <img
              src={src}
              alt={`Certificate for ${eventName}`}
              onError={() => setFailed(true)}
              className="mx-auto max-h-[460px] w-auto rounded-sm bg-white shadow-paper"
            />
          )
        ) : (
          <Unavailable
            reason={
              failed
                ? objectUrl
                  ? 'This file can’t be previewed here — it may be damaged or in an unusual format. You can still attach it, or choose a different file.'
                  : 'The certificate file couldn’t be loaded.'
                : `The student attached a ${ACCEPTED_TYPES[certificate.fileType]} file, but this prototype doesn’t keep uploaded files permanently, so it can’t be previewed or downloaded. Only its details, below, were recorded.`
            }
          />
        )}
      </div>
      {showMeta && (
        <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
          {isPdf ? <FileText className="size-4" aria-hidden /> : <FileImage className="size-4" aria-hidden />}
          <span className="max-w-full truncate font-mono text-ink-soft">{certificate.fileName}</span>
          <span aria-hidden>·</span>
          <span>{ACCEPTED_TYPES[certificate.fileType]}</span>
          <span aria-hidden>·</span>
          <span>{formatBytes(certificate.sizeBytes)}</span>
          {openable && !failed && (
            <>
              <span aria-hidden>·</span>
              <OpenLink href={src} />
            </>
          )}
          {certificate.previewUrl && !certificate.previewDataUrl && !objectUrl && (
            <span className="w-full text-[11.5px] italic">Demonstration certificate bundled with the prototype.</span>
          )}
        </figcaption>
      )}
    </figure>
  )
}

function OpenLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-800 underline-offset-2 hover:underline">
      Open in new tab <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

function Unavailable({ reason, action, title = 'Preview unavailable' }: { reason: string; action?: ReactNode; title?: string }) {
  return (
    <div role="status" className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-muted">
        <FileX2 className="size-5" aria-hidden />
      </span>
      <p className="mt-3 font-medium text-navy-900">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{reason}</p>
      {action && <div className="mt-3 text-[13px]">{action}</div>}
    </div>
  )
}
