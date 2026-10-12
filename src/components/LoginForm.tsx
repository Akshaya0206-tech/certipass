import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CircleAlert, KeyRound, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { DEMO_CREDENTIALS } from '../data/mockData'
import { AuthError, homePathFor, loginPathFor } from '../services/auth'
import type { Role } from '../types'
import { Button } from './ui/Button'
import { Field, PasswordInput, TextInput } from './ui/FormField'

interface LoginFormProps {
  role: Role
  /** Extra controls rendered between the password field and the submit button. */
  beforeSubmit?: ReactNode
  footer?: ReactNode
}

type Errors = Partial<Record<'username' | 'password' | 'form', string>>

const PORTAL_LABEL: Record<Role, string> = { student: 'Go to student sign-in', faculty: 'Go to faculty sign-in', admin: 'Go to administrator sign-in' }

export function LoginForm({ role, beforeSubmit, footer }: LoginFormProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { login } = useAuth()
  const inFlight = useRef(false)
  const [portal, setPortal] = useState<Role | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  function validate(): Errors {
    const e: Errors = {}
    if (!username.trim()) e.username = 'Enter your username.'
    if (!password) e.password = 'Enter your password.'
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (inFlight.current) return // ignore repeat submits (e.g. Enter pressed twice)
    const e = validate()
    setErrors(e)
    setPortal(null)
    if (Object.keys(e).length) return
    inFlight.current = true
    setLoading(true)
    try {
      const user = await login(username, password, role)
      toast.success(`Welcome back, ${user.fullName.replace(/^(Dr|Prof)\.\s+/, '').split(' ')[0]}`)
      // Only honour a "return to" path inside this role's own area.
      const from = (location.state as { from?: string } | null)?.from
      const home = homePathFor(role)
      navigate(from && (from === home || from.startsWith(`${home}/`)) ? from : home, { replace: true })
    } catch (err) {
      setPassword('')
      setErrors({ form: err instanceof AuthError ? err.message : 'Sign-in failed. Please try again.' })
      if (err instanceof AuthError && err.code === 'wrong_portal' && err.portal) setPortal(err.portal)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  const demo = DEMO_CREDENTIALS[role]

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {errors.form && (
        <div role="alert" className="flex gap-2.5 rounded-md border border-terracotta-300 bg-terracotta-50 px-3.5 py-3 text-sm text-terracotta-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p>{errors.form}</p>
            {portal && (
              <Link to={loginPathFor(portal)} className="mt-1.5 inline-block font-medium text-navy-800 underline underline-offset-2">
                {PORTAL_LABEL[portal]}
              </Link>
            )}
          </div>
        </div>
      )}
      <Field label="Username" required error={errors.username}>
        <TextInput
          readOnly={loading}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            if (errors.username || errors.form) setErrors({})
          }}
        />
      </Field>
      <Field label="Password" required error={errors.password}>
        <PasswordInput
          readOnly={loading}
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (errors.password || errors.form) setErrors({})
          }}
        />
      </Field>
      {beforeSubmit}
      <Button type="submit" size="lg" className="w-full" loading={loading} icon={<LogIn className="size-4" aria-hidden />}>
        Sign In
      </Button>
      {footer}

      {import.meta.env.DEV && (
        <aside className="rounded-md border border-dashed border-lavender-300 bg-lavender-50 px-4 py-3 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-lavender-700">
            <KeyRound className="size-3.5" aria-hidden />
            Development demo account
          </p>
          <p className="mt-1 text-ink-soft">
            <span className="font-mono">{demo.username}</span> / <span className="font-mono">{demo.password}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setUsername(demo.username)
              setPassword(demo.password)
              setErrors({})
            }}
            className="mt-1.5 text-[12.5px] font-medium text-navy-800 underline underline-offset-2 hover:text-navy-900"
          >
            Fill demo credentials
          </button>
        </aside>
      )}
    </form>
  )
}
