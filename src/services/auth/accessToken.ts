/*
 * The bridge between sign-in and the certificate storage API.
 *
 * The CertiPass Worker authorises every request from the session token it issued
 * at sign-in. The offline prototype's sign-in is local and has no such token, so
 * by default nothing is registered here and the storage client reports "no
 * session" rather than pretending. When the build is connected to the Worker,
 * the Worker-backed provider registers one function here (see auth/index.ts) and
 * certificate storage starts working with no other change.
 */
export type AccessTokenProvider = () => Promise<string | null>

let provider: AccessTokenProvider | null = null

export function registerAccessTokenProvider(next: AccessTokenProvider | null) {
  provider = next
}

export const hasAccessTokenProvider = () => provider !== null

export async function getAccessToken(): Promise<string | null> {
  if (!provider) return null
  try {
    return await provider()
  } catch {
    return null
  }
}
