import { useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { useRequiredUser } from '../../hooks/useData'
import { cn } from '../../lib/cn'
import { setUserActive } from '../../services/adminService'
import type { User } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

export function AccountStatusLabel({ active }: { active: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', active ? 'text-navy-800' : 'text-ink-muted')}>
      <span className={cn('size-1.5 rounded-full', active ? 'bg-sky-500' : 'bg-line-strong')} aria-hidden />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

/**
 * Activate / deactivate an account, always behind a confirmation. An
 * administrator can't deactivate the account they are signed in with.
 */
export function AccountStatusButton({ user, size = 'sm' }: { user: User; size?: 'sm' | 'md' }) {
  const me = useRequiredUser()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  if (user.id === me.id) return <span className="text-[12px] text-ink-muted">Your account</span>

  function confirm() {
    try {
      setUserActive(user.id, !user.active)
      toast.success(user.active ? 'Account deactivated' : 'Account activated', user.fullName)
    } catch (err) {
      toast.error('Could not change the account', err instanceof Error ? err.message : undefined)
    }
    setOpen(false)
  }

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
        {user.active ? 'Deactivate' : 'Activate'}
        <span className="sr-only"> {user.fullName}</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={user.active ? 'Deactivate this account?' : 'Activate this account?'}
        description={`${user.fullName} (@${user.username})`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={user.active ? 'danger' : 'primary'} onClick={confirm}>
              {user.active ? 'Deactivate account' : 'Activate account'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {user.active
            ? 'They will no longer be able to sign in, and any open session ends. The account and all of its records are kept and can be restored by reactivating it.'
            : 'They will be able to sign in again with their existing credentials.'}
        </p>
      </Dialog>
    </>
  )
}
