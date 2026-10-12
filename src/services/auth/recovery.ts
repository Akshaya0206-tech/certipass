/*
 * Account recovery seam.
 *
 * Phase 2 has no recovery mechanism: CertiPass uses usernames, not email, and
 * an approved institutional recovery process hasn't been defined yet. The UI
 * reads its message from here, so a real implementation can be added later
 * without touching the sign-in screens. Nothing here pretends to reset a
 * password.
 */
export interface RecoveryOptions {
  available: boolean
  title: string
  message: string
  steps: string[]
}

export function getRecoveryOptions(): RecoveryOptions {
  return {
    available: false,
    title: 'Account recovery',
    message:
      'Password recovery isn’t available in this prototype. Account recovery will be provided through an approved recovery process run by your institution.',
    steps: [
      'Contact your department’s achievement coordinator or the Office of Academic Records.',
      'Bring your college ID card so they can confirm your register number.',
    ],
  }
}
