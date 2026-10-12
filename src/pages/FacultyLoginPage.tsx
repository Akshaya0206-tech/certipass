import { LoginForm } from '../components/LoginForm'
import { AuthLayout } from '../layouts/AuthLayout'

export default function FacultyLoginPage() {
  return (
    <AuthLayout role="faculty" title="Welcome to CertiPass" subtitle="Faculty sign in. Accounts are issued by the records office.">
      <LoginForm role="faculty" />
    </AuthLayout>
  )
}
