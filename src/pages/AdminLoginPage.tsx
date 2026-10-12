import { LoginForm } from '../components/LoginForm'
import { AuthLayout } from '../layouts/AuthLayout'

export default function AdminLoginPage() {
  return (
    <AuthLayout role="admin" title="Welcome to CertiPass" subtitle="Administrator sign in. Restricted to the records office.">
      <LoginForm role="admin" />
    </AuthLayout>
  )
}
