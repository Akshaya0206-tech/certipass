import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Field, TextInput } from '../components/ui/FormField'
import { PageHeader, Section } from '../components/ui/PageHeader'
import { InlineAlert } from '../components/ui/States'
import { useAuth, useUser } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { departmentName } from '../data/seed'
import { ROLE_LABEL } from '../layouts/navigation'
import { updateOwnProfile } from '../services/adminService'
import { ApiError, changePassword, passwordProblem } from '../services/auth'
import { resetDemoData } from '../services/store'

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  )
}

export default function ProfilePage() {
  const user = useUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [phone, setPhone] = useState(user.phone ?? '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [resetting, setResetting] = useState(false)

  const phoneError = phone && !/^[+\d][\d\s-]{6,14}$/.test(phone) ? 'Enter a valid phone number.' : ''
  const nextError = next ? passwordProblem(next) ?? '' : ''
  const confirmError = confirm && confirm !== next ? 'The passwords do not match.' : ''

  async function savePhone(e: FormEvent) {
    e.preventDefault()
    if (phoneError) return
    setSavingPhone(true)
    try {
      await updateOwnProfile({ phone })
      toast.success('Contact details saved.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.')
    } finally {
      setSavingPhone(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setPwError('')
    if (!current || !next || nextError || next !== confirm) return setPwError('Fill in all three fields and fix the messages shown.')
    setSavingPw(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Password changed.')
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Could not change the password.')
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div>
      <PageHeader title="Profile and settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Account">
          <dl className="grid gap-4 p-4 sm:grid-cols-2">
            <Item label="Name">{user.name}</Item>
            <Item label="Role">{ROLE_LABEL[user.role]}</Item>
            <Item label="Username">
              <span className="font-mono">{user.username}</span>
            </Item>
            <Item label="College email">{user.email}</Item>
            <Item label="Department">{departmentName(user.department)}</Item>
            {user.role === 'student' ? (
              <>
                <Item label="Register number">
                  <span className="font-mono">{user.registerNo}</span>
                </Item>
                <Item label="Year and section">
                  {user.year} year · Section {user.section}
                </Item>
              </>
            ) : (
              <Item label="Designation">{user.designation}</Item>
            )}
            {user.role === 'faculty' && user.permissions && (
              <Item label="Review access">
                {user.permissions.canReview ? 'Can approve and reject' : 'View only'} · {user.permissions.scope === 'all' ? 'All departments' : `${user.department} department`}
              </Item>
            )}
          </dl>
          <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">Identity details are managed by the college office and cannot be edited here.</p>
        </Section>

        <div className="space-y-5">
          <Section title="Contact">
            <form onSubmit={savePhone} noValidate className="space-y-3 p-4">
              <Field label="Phone number (optional)" error={phoneError}>
                <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </Field>
              <Button type="submit" loading={savingPhone} disabled={!!phoneError}>
                Save contact details
              </Button>
            </form>
          </Section>

          <Section title="Change password">
            <form onSubmit={savePassword} noValidate className="space-y-3 p-4">
              <Field label="Current password" required>
                <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="New password" required error={nextError} hint="At least 8 characters, with letters and numbers.">
                <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password" required error={confirmError}>
                <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </Field>
              {pwError && <InlineAlert tone="error">{pwError}</InlineAlert>}
              <Button type="submit" loading={savingPw}>
                Change password
              </Button>
            </form>
          </Section>

          <Section title="Demo data">
            <div className="space-y-3 p-4">
              <p className="text-sm text-ink-soft">This prototype keeps everything in this browser. Reset restores the original fictional records and signs everyone out.</p>
              <Button variant="danger" onClick={() => setResetting(true)}>
                <RotateCcw className="size-4" aria-hidden /> Reset demo data
              </Button>
            </div>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={resetting}
        title="Reset all demo data?"
        description="Applications, accounts and changes you made in this browser will be replaced with the original demo records."
        confirmLabel="Reset"
        tone="danger"
        onClose={() => setResetting(false)}
        onConfirm={async () => {
          await resetDemoData()
          logout()
          navigate('/login', { replace: true })
        }}
      />
    </div>
  )
}
