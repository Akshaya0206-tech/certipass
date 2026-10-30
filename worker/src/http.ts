import { ApiError } from './errors'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

/**
 * Reads a small JSON object from a request. Refuses anything that is not JSON, is larger than `max` bytes
 * (even if it never says how large it is), or is not an object, before any of it is used.
 */
export async function readJson(request: Request, max = 16 * 1024): Promise<Record<string, unknown>> {
  if (!/^application\/json/i.test(request.headers.get('content-type') ?? '')) {
    throw new ApiError(415, 'invalid_json', 'Send the request as JSON.')
  }
  const tooLarge = () => new ApiError(413, 'request_too_large', 'That request is too large.')
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) throw tooLarge()
  if (!request.body) throw new ApiError(400, 'invalid_json', 'The request body is empty.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request could not be read.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(400, 'invalid_json', 'The request could not be read.')
  return parsed as Record<string, unknown>
}
