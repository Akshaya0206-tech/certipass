import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import { DadaLogo, LogoMark } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Checkbox, Field, TextInput } from '../components/ui/FormField'
import { InlineAlert } from '../components/ui/States'
import { useAuth } from '../context/AuthContext'
import { DEMO_ACCOUNTS } from '../data/seed'
import { ApiError } from '../services/auth'
import { HOME, ROLE_LABEL } from '../layouts/navigation'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [forgot, setForgot] = useState(false)

  const idError = touched && !identifier.trim() ? 'Enter your username or college email.' : ''
  const pwError = touched && !password ? 'Enter your password.' : ''

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setFormError('')
    if (!identifier.trim() || !password) return
    setLoading(true)
    try {
      const user = await login(identifier, password, remember)
      const from = (location.state as { from?: string } | null)?.from
      // Only return to a page this account is allowed to use.
      navigate(from && from.startsWith(HOME[user.role]) ? from : HOME[user.role], { replace: true })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      {/* Brand panel */}
      <section className="relative flex flex-col overflow-hidden bg-purple-dark text-white lg:min-h-screen" aria-label="About the portal">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-gold" aria-hidden />
        <div className="relative z-10 px-6 py-8 sm:px-10 lg:px-14 lg:pt-10 lg:pb-0">
          <div className="flex items-center gap-4">
            <LogoMark decorative className="h-16" />
            <p className="min-w-0 text-sm font-semibold tracking-[0.14em] text-purple-200 uppercase">Rajalakshmi Engineering College</p>
            <DadaLogo className="ml-auto h-10 shrink-0 sm:h-16" />
          </div>
          <h1 className="mt-8 font-serif text-3xl leading-tight font-semibold sm:text-4xl lg:mt-8 lg:text-[2.6rem]">OD Certificate Pass Portal</h1>
          <p className="mt-3 max-w-md text-base text-purple-100 lg:text-lg">A simpler way to manage your On-Duty applications.</p>
          <div className="mt-5 h-[3px] w-14 bg-gold" aria-hidden />
          <ul className="mt-6 hidden max-w-md space-y-2 text-sm text-purple-100 lg:block">
            <li>Apply once with your event proof and track every step.</li>
            <li>Faculty review with a clear record of each decision.</li>
            <li>Approved passes you can print on A4.</li>
          </ul>
        </div>
        {/*
          The mascot fills whatever height is left under the text (minus a gap), so it never collides with the
          list or pushes the panel past the viewport. It is cut off at the hoodie hem and rises from the bottom edge.
        */}
        <div className="relative hidden min-h-[18rem] flex-1 lg:block">
          <div className="absolute bottom-0 left-1/2 h-3/4 w-3/4 -translate-x-1/2 rounded-t-full bg-purple/40" aria-hidden />
          <img
            src="/mascot.webp"
            width={464}
            height={876}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute bottom-0 left-1/2 h-[calc(100%-2rem)] max-h-[34rem] w-auto -translate-x-1/2 select-none"
          />
        </div>
      </section>

      {/* Form panel */}
      <main id="main" className="flex items-center justify-center bg-lavender px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-purple-dark">Sign in</h2>
            <p className="text-sm text-ink-muted">Use your college account. Your role is set by the college, not chosen here.</p>
          </div>

          <form onSubmit={onSubmit} noValidate className="panel space-y-4 p-5 sm:p-6">
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-red-line bg-red-bg px-3 py-2 text-sm font-medium text-red-fg">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </div>
            )}
            <Field label="Username or college email" error={idError} required>
              <TextInput value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. 230701004@rajalakshmi.edu.in" disabled={loading} />
            </Field>
            <Field label="Password" error={pwError} required>
              <PasswordInput value={password} onChange={setPassword} show={show} onToggle={() => setShow(!show)} disabled={loading} />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <Checkbox label="Remember me" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-purple underline underline-offset-2">
                Forgot password?
              </button>
            </div>
            <Button type="submit" variant="primary" loading={loading} className="h-11 w-full border-b-[3px] border-b-gold">
              {!loading && <LogIn className="size-4" aria-hidden />}
              {loading ? 'Signing in…' : 'Log in'}
            </Button>
          </form>

          <section className="mt-5" aria-labelledby="demo-heading">
            <h3 id="demo-heading" className="kicker">
              Demo accounts (prototype only)
            </h3>
            <ul className="mt-2 space-y-2">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.username} className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2">
                  <div className="min-w-0 text-[13px]">
                    <p className="font-semibold text-ink">{ROLE_LABEL[a.role]}</p>
                    <p className="text-ink-muted [overflow-wrap:anywhere]">
                      {a.label} · <span className="font-mono">{a.username}</span> / <span className="font-mono">{a.password}</span>
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIdentifier(a.username)
                      setPassword(a.password)
                      setFormError('')
                    }}
                  >
                    Fill
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">All names and records are fictional. Sign-in runs in your browser and protects nothing; do not enter real passwords.</p>
          </section>
        </div>
      </main>

      <Dialog
        open={forgot}
        title="Forgot your password?"
        onClose={() => setForgot(false)}
        footer={
          <Button variant="primary" onClick={() => setForgot(false)}>
            OK
          </Button>
        }
      >
        <InlineAlert>Password resets are handled by the college IT office. In this prototype no email or reset service is connected, so nothing will be sent.</InlineAlert>
      </Dialog>
    </div>
  )
}

function PasswordInput({ value, onChange, show, onToggle, disabled }: { value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <TextInput type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="current-password" className="pr-11" disabled={disabled} />
      <button type="button" onClick={onToggle} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} className="absolute top-0 right-0 inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:text-purple">
        {show ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  )
}
