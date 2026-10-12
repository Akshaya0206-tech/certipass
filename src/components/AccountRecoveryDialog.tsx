import { getRecoveryOptions } from '../services/auth'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

/**
 * "Forgot Password?" explanation. Content comes from the recovery module, so
 * an approved recovery flow can replace it later without touching the page.
 */
export function AccountRecoveryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const options = getRecoveryOptions()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={options.title}
      description="No password has been changed."
      footer={<Button onClick={onClose}>Understood</Button>}
    >
      <p className="text-sm text-ink-soft">{options.message}</p>
      <p className="label-archival mt-5 mb-2">In the meantime</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
        {options.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </Dialog>
  )
}
