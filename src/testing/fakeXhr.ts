/*
 * A stand-in for XMLHttpRequest for tests. The test decides when the "upload" progresses and what the server answers,
 * so progress bars, errors and retries can be checked without a network.
 */
export class FakeXHR {
  static instances: FakeXHR[] = []
  static reset() {
    FakeXHR.instances = []
  }

  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  status = 0
  responseText = ''
  responseType = ''
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: FormData | null = null
  aborted = false

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: FormData) {
    this.body = body
    FakeXHR.instances.push(this)
  }
  abort() {
    this.aborted = true
    this.onabort?.()
  }

  // ── What a test does ──
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.onload?.()
  }
  failNetwork() {
    this.onerror?.()
  }
  /** One field of the submitted form. */
  field(name: string) {
    return this.body?.get(name) ?? null
  }
}
