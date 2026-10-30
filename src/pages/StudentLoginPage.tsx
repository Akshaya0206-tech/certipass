import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LoginForm } from '../components/LoginForm'
import { AccountRecoveryDialog } from '../components/AccountRecoveryDialog'
import { AuthLayout } from '../layouts/AuthLayout'

export default function StudentLoginPage() {
  const [forgotOpen, setForgotOpen] = useState(false)

  return (
    <AuthLayout role="student" title="Welcome to CertiPass" subtitle="Sign in with your college email to open your achievement passport.">
      <LoginForm
        role="student"
        beforeSubmit={
          <div className="-mt-2 flex justify-end">
            <button type="button" onClick={() => setForgotOpen(true)} className="text-[13px] font-medium text-navy-800 underline-offset-2 hover:underline">
              Forgot Password?
            </button>
          </div>
        }
        footer={
          <p className="text-center text-[13.5px] text-ink-soft">
            New to CertiPass?{' '}
            <Link to="/register" className="font-medium text-navy-800 underline underline-offset-2">
              Create Account
            </Link>
          </p>
        }
      />
      <AccountRecoveryDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </AuthLayout>
  )
}
