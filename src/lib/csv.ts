/*
 * CSV export helpers (RFC 4180 style).
 *  - Fields containing commas, quotation marks, or line breaks are quoted,
 *    with embedded quotation marks doubled.
 *  - Text that a spreadsheet would treat as a formula (starting with = + - @)
 *    is prefixed with an apostrophe so it is read as text.
 *  - Rows end with CRLF; a UTF-8 byte-order mark helps Excel read accents.
 */
export type CsvValue = string | number | null | undefined

export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'number' ? String(value) : value
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n') + '\r\n'
}

/** A filename-safe timestamp, e.g. 2026-10-11. */
export function fileDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Hand a CSV to the browser as a download. Nothing is sent anywhere. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
