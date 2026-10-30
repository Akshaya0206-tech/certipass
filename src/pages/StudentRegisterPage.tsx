import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, CircleAlert, UserPlus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, PasswordInput, SelectInput, TextInput } from '../components/ui/FormField'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useAcademicConfig } from '../hooks/useAcademics'
import { AuthLayout } from '../layouts/AuthLayout'
import { cn } from '../lib/cn'
import { activeDepartments, activeSections } from '../services/academicService'
import { AuthError, PASSWORD_RULES, toRegistration, usesBackendAuth, validateRegistration } from '../services/auth'
import type { StudentRegistrationForm } from '../services/auth'

type FormState = StudentRegistrationForm
type FieldName = keyof FormState
type Errors = Partial<Record<FieldName | 'form', string>>

const EMPTY: FormState = { fullName: '', username: '', password: '', confirmPassword: '', registerNumber: '', department: '', year: '', section: '' }

export default function StudentRegisterPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { registerStudent } = useAuth()
  const inFlight = useRef(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  // Departments and sections come from the academic configuration; deactivated ones aren't offered.
  const config = useAcademicConfig()
  const departments = activeDepartments(config)
  const sections = activeSections(config)
  const liveErrors = validateRegistration(form)
  const show = (name: FieldName) => errors[name] ?? ((submitted || touched[name]) ? liveErrors[name] : undefined)

  function set<K extends FieldName>(name: K, value: string) {
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name] || errors.form) setErrors((e) => ({ ...e, [name]: undefined, form: undefined }))
  }
  const blur = (name: FieldName) => () => setTouched((t) => ({ ...t, [name]: true }))

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    const e = validateRegistration(form)
    if (Object.keys(e).length) {
      setErrors({ form: 'Please fix the highlighted fields.' })
      // Wait for the error state to render, then move focus to the first invalid field.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus())
      return
    }
    inFlight.current = true
    setLoading(true)
    try {
      // toRegistration copies only the known fields; the role is set by the auth service, never the form.
      const user = await registerStudent(toRegistration(form))
      toast.success('Account created', `Welcome to CertiPass, ${user.fullName.split(' ')[0]}. You’re signed in.`)
      navigate('/student', { replace: true })
    } catch (err) {
      if (err instanceof AuthError && err.code === 'pending_approval') {
        // Not a failure: the account exists and just needs the records office to approve it before first sign-in.
        toast.success('Registration received', err.message)
        navigate('/login', { replace: true })
        return
      }
      if (err instanceof AuthError && err.field) {
        setErrors({ [err.field]: err.message, form: 'Please fix the highlighted fields.' })
        requestAnimationFrame(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus())
      } else setErrors({ form: err instanceof Error ? err.message : 'Registration failed. Please try again.' })
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      wide
      title="Create your student account"
      subtitle="It takes a minute. You’ll sign in with your college email."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-8">
        {errors.form && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-terracotta-300 bg-terracotta-50 px-3.5 py-3 text-sm text-terracotta-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errors.form}
          </div>
        )}

        <fieldset className="space-y-4">
          <legend className="label-archival mb-4">01 · About you</legend>
          <Field label="Full Name" required error={show('fullName')}>
            <TextInput autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Register Number" required error={show('registerNumber')} hint="Exactly as printed on your ID card">
              <TextInput
                value={form.registerNumber}
                onChange={(e) => set('registerNumber', e.target.value.toUpperCase())}
                onBlur={blur('registerNumber')}
                className="font-mono uppercase"
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Department" required error={show('department')}>
              <SelectInput value={form.department} onChange={(e) => set('department', e.target.value)} onBlur={blur('department')}>
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Year" required error={show('year')}>
              <SelectInput value={form.year} onChange={(e) => set('year', e.target.value)} onBlur={blur('year')}>
                <option value="">Select year</option>
                <option value="1">First year</option>
                <option value="2">Second year</option>
                <option value="3">Third year</option>
                <option value="4">Final year</option>
              </SelectInput>
            </Field>
            <Field label="Section" required error={show('section')}>
              <SelectInput value={form.section} onChange={(e) => set('section', e.target.value)} onBlur={blur('section')}>
                <option value="">Select section</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    Section {s}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </fieldset>

        <div className="border-t border-line pt-7">
        <fieldset className="space-y-4">
          <legend className="label-archival mb-4">02 · Sign-in details</legend>
          <Field label="College email" required error={show('username')} hint="Your @rajalakshmi.edu.in address, e.g. name.2024.dept@rajalakshmi.edu.in">
            <TextInput
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.username}
              onChange={(e) => set('username', e.target.value.toLowerCase())}
              onBlur={blur('username')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" required error={show('password')}>
              <PasswordInput autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} onBlur={blur('password')} />
            </Field>
            <Field label="Confirm Password" required error={show('confirmPassword')}>
              <PasswordInput autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} onBlur={blur('confirmPassword')} />
            </Field>
          </div>
          <ul className="grid gap-1.5 text-[12.5px] sm:grid-cols-3" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(form.password)
              return (
                <li key={r.label} className={cn('flex items-center gap-1.5', ok ? 'text-navy-800' : 'text-ink-muted')}>
                  <span className={cn('flex size-4 items-center justify-center rounded-full border', ok ? 'border-navy-800 bg-navy-800 text-ivory' : 'border-line-strong')}>
                    {ok && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
                  </span>
                  {r.label}
                  <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
                </li>
              )
            })}
          </ul>
        </fieldset>
        </div>

        <div className="space-y-4 border-t border-line pt-6">
          <p className="text-[12.5px] text-ink-muted">
            <span className="text-terracotta-600">*</span> Required field.{!usesBackendAuth && ' This prototype stores your details only in this browser.'}
          </p>
          <Button type="submit" size="lg" className="w-full sm:w-auto" loading={loading} icon={<UserPlus className="size-4" aria-hidden />}>
            Create Account
          </Button>
          <p className="text-sm text-ink-soft">
            Already registered?{' '}
            <Link to="/" className="font-medium text-navy-800 underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  )
}
