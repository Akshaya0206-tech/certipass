import { useState } from 'react'
import { Database, FileCheck2, RotateCcw, ShieldAlert } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../context/ToastContext'
import { useAchievements, useRequiredUser, useUsers } from '../hooks/useData'
import { ACCEPTED_TYPES, MAX_FILE_BYTES, formatBytes } from '../services/fileService'
import { recordAudit } from '../services/auditService'
import { resetDemoData } from '../services/store'

export default function SettingsPage() {
  const toast = useToast()
  const me = useRequiredUser()
  const users = useUsers()
  const achievements = useAchievements()
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="space-y-8">
      <PageHeader kicker="Administration" title="Settings" description="Prototype configuration. Institution-wide settings will be managed here once the backend is connected." />

      <section className="paper divide-y divide-line">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Database className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
            <div>
              <h2 className="font-medium text-navy-900">Demonstration data</h2>
              <p className="mt-1 max-w-xl text-sm text-ink-soft">
                The prototype keeps its data in this browser’s local storage — currently {users.length} users and {achievements.length} records. Resetting restores the original sample dataset and removes any registrations, faculty accounts, submissions, comments, status changes and academic configuration changes made here.
              </p>
            </div>
          </div>
          <Button variant="danger" onClick={() => setConfirm(true)} icon={<RotateCcw className="size-4" aria-hidden />}>
            Reset demo data
          </Button>
        </div>

        <div className="flex gap-4 p-5">
          <FileCheck2 className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
          <div>
            <h2 className="font-medium text-navy-900">Certificate files</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Accepted formats: {Object.values(ACCEPTED_TYPES).join(', ')}. Maximum size: {formatBytes(MAX_FILE_BYTES)}. Files are validated in the browser only; storage is not connected in this prototype.
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-5">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-terracotta-600" aria-hidden />
          <div>
            <h2 className="font-medium text-navy-900">Security notice</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Sign-in in this prototype is simulated and provides no real security. Passwords are never stored in browser storage — self-registered accounts keep only a salted hash — but checks run in the browser, and the stored session record can be edited by anyone with access to this device. Route guards only steer navigation. Do not enter real passwords or personal data.
            </p>
          </div>
        </div>
      </section>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Reset demonstration data?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemoData()
                // The reset clears the audit trail too, so this is its first entry.
                recordAudit(me, 'data_reset', 'Restored the demonstration dataset')
                setConfirm(false)
                toast.success('Demo data restored', 'The original sample dataset has been reloaded.')
              }}
            >
              Reset data
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">All changes made in this browser will be replaced with the original sample dataset, and self-registered student accounts will be removed. Demo accounts (including yours) stay signed in.</p>
      </Dialog>
    </div>
  )
}
