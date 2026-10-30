import { useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { useRequiredUser } from '../../hooks/useData'
import { cn } from '../../lib/cn'
import { setUserActive } from '../../services/adminService'
import type { User } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

export function AccountStatusLabel({ active, pending = false }: { active: boolean; pending?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', active ? 'text-navy-800' : 'text-ink-muted')}>
      <span className={cn('size-1.5 rounded-full', active ? 'bg-sky-500' : pending ? 'bg-gold-dark' : 'bg-line-strong')} aria-hidden />
      {active ? 'Active' : pending ? 'Awaiting approval' : 'Inactive'}
    </span>
  )
}

/**
 * Activate / deactivate an account, always behind a confirmation. An administrator can't deactivate the account they
 * are signed in with. For a student who has registered and is waiting, "activate" is the approval.
 */
export function AccountStatusButton({ user, size = 'sm' }: { user: User; size?: 'sm' | 'md' }) {
  const me = useRequiredUser()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = !!user.pending

  if (user.id === me.id) return <span className="text-[12px] text-ink-muted">Your account</span>

  async function confirm() {
    setBusy(true)
    try {
      await setUserActive(user.id, !user.active)
      toast.success(user.active ? 'Account deactivated' : pending ? 'Account approved' : 'Account activated', user.fullName)
    } catch (err) {
      toast.error('Could not change the account', err instanceof Error ? err.message : undefined)
    }
    setBusy(false)
    setOpen(false)
  }

  const verb = user.active ? 'Deactivate' : pending ? 'Approve' : 'Activate'
  return (
    <>
      <Button
        size={size}
        variant={user.active ? 'secondary' : 'primary'}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {verb}
        <span className="sr-only"> {user.fullName}</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={user.active ? 'Deactivate this account?' : pending ? 'Approve this account?' : 'Activate this account?'}
        description={`${user.fullName} (@${user.username})`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={user.active ? 'danger' : 'primary'} onClick={confirm} loading={busy}>
              {verb} account
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {user.active
            ? 'They will no longer be able to sign in, and any open session ends. The account and all of its records are kept and can be restored by reactivating it.'
            : pending
              ? 'Check that the name and register number match the college’s records. Once approved, they can sign in and upload certificates.'
              : 'They will be able to sign in again with their existing credentials.'}
        </p>
      </Dialog>
    </>
  )
}
