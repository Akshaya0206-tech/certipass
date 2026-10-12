const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short' })

/** Accepts either a YYYY-MM-DD date or a full ISO timestamp. */
export function formatDate(value: string) {
  return dateFmt.format(new Date(value.length === 10 ? `${value}T00:00:00` : value))
}

export function formatMonth(value: string) {
  return monthFmt.format(new Date(value.length === 10 ? `${value}T00:00:00` : value))
}

export function formatRelative(iso: string, now = Date.now()) {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`
  return formatDate(iso)
}

export function initials(name: string) {
  return name
    .replace(/^(Dr|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export const YEAR_LABEL: Record<number, string> = { 1: 'First year', 2: 'Second year', 3: 'Third year', 4: 'Final year' }

export function ordinalYear(year: number) {
  return ['', 'I', 'II', 'III', 'IV'][year] ?? String(year)
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Date and time of an ISO timestamp, in the viewer's local time. */
export function formatDateTime(iso: string) {
  return dateTimeFmt.format(new Date(iso))
}
