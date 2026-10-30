import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, KeyRound, PenLine, Trash2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { deleteFacultyAccount, newPasswordError, resetFacultyPassword } from '../../services/adminService'
import { PASSWORD_RULES } from '../../services/auth'
import type { FacultyUser } from '../../types'
import { buttonClasses, Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, PasswordInput } from '../ui/FormField'
import { AccountStatusButton } from './AccountStatus'

/*
 * What an administrator can do to one faculty account, beyond switching it on or off: change its details, set a new
 * password, delete it. Every action goes through the admin service, which asks the CertiPass server (an administrator
 * only) and writes the audit trail. A password typed here is sent once and never shown again.
 */

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function ResetPasswordDialog({ user, open, onClose }: { user: FacultyUser; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
      setSubmitted(false)
      setError(undefined)
    }
  }, [open])

  const problem = newPasswordError(password, confirm)
  const rulesOk = PASSWORD_RULES.every((r) => r.test(password))
  const passwordError = !submitted ? undefined : !password ? 'Enter the new password.' : !rulesOk ? 'At least 8 characters, with upper and lower case letters and a number.' : undefined
  const confirmError = submitted && password && rulesOk && confirm !== password ? 'The two passwords do not match.' : undefined
  const formId = `reset-password-${user.id}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    if (problem) return
    inFlight.current = true
    setSaving(true)
    try {
      await resetFacultyPassword(user.id, password, confirm)
      toast.success('Password reset', `${user.fullName} can sign in with the new password. Share it with them yourself.`)
      onClose()
    } catch (err) {
      setError(message(err, 'The password could not be reset.'))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size="sm"
      title="Reset password"
      description={`${user.fullName} (@${user.username})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving} icon={<KeyRound className="size-4" aria-hidden />}>
            Reset password
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-terracotta-300 bg-terracotta-50 px-3.5 py-3 text-sm text-terracotta-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Their current password stops working at once and any open sign-in ends. Choose a new one and share it with them yourself; it can’t be viewed afterwards.
        </p>
        <Field label="New password" required error={passwordError} hint="At least 8 characters, with upper and lower case letters and a number.">
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(undefined)
            }}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" required error={confirmError}>
          <PasswordInput
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError(undefined)
            }}
            autoComplete="new-password"
          />
        </Field>
      </form>
    </Dialog>
  )
}

export function DeleteFacultyDialog({ user, open, onClose, onDeleted }: { user: FacultyUser; open: boolean; onClose: () => void; onDeleted?: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (open) setError(undefined)
  }, [open])

  async function confirm() {
    setBusy(true)
    try {
      await deleteFacultyAccount(user.id)
      toast.success('Faculty account deleted', user.fullName)
      onClose()
      onDeleted?.()
    } catch (err) {
      setError(message(err, 'The account could not be deleted.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="sm"
      title="Delete this faculty account?"
      description={`${user.fullName} (@${user.username})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy} icon={<Trash2 className="size-4" aria-hidden />}>
            Delete account
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-3 flex gap-2.5 rounded-md border border-terracotta-300 bg-terracotta-50 px-3.5 py-3 text-sm text-terracotta-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}
      <p className="text-sm text-ink-soft">
        This removes the account for good. They can no longer sign in and any open sign-in ends. Student records and certificates are not affected, because
        faculty accounts don’t own any.
      </p>
      <p className="mt-2 text-sm text-ink-soft">To keep the account but stop it being used, choose Deactivate instead. That can be undone.</p>
    </Dialog>
  )
}

/** Edit, reset password, activate or deactivate, and delete, for one faculty account. */
export function FacultyRowActions({ user }: { user: FacultyUser }) {
  const [resetting, setResetting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // A click on a button must not also open the account (the row is a link).
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div className="flex flex-wrap justify-end gap-1.5" onClick={stop}>
      <Link to={`/admin/users/${user.id}?edit=1`} className={buttonClasses('secondary', 'sm')} onClick={stop}>
        <PenLine className="size-3.5" aria-hidden />
        Edit<span className="sr-only"> {user.fullName}</span>
      </Link>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => {
          stop(e)
          setResetting(true)
        }}
        icon={<KeyRound className="size-3.5" aria-hidden />}
      >
        Reset password<span className="sr-only"> for {user.fullName}</span>
      </Button>
      <AccountStatusButton user={user} />
      <Button
        size="sm"
        variant="danger"
        onClick={(e) => {
          stop(e)
          setDeleting(true)
        }}
        icon={<Trash2 className="size-3.5" aria-hidden />}
      >
        Delete<span className="sr-only"> {user.fullName}</span>
      </Button>
      <ResetPasswordDialog user={user} open={resetting} onClose={() => setResetting(false)} />
      <DeleteFacultyDialog user={user} open={deleting} onClose={() => setDeleting(false)} />
    </div>
  )
}
