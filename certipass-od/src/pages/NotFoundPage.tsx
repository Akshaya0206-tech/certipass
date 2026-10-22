import { FileQuestion } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { LinkButton } from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { HOME } from '../layouts/navigation'

export function WorkspaceNotFound() {
  return (
    <div className="panel flex flex-col items-center px-4 py-12 text-center">
      <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-lavender-deep text-purple" aria-hidden>
        <FileQuestion className="size-7" />
      </span>
      <h1 className="text-xl font-semibold text-purple-dark">This page does not exist</h1>
      <p className="mt-1 text-sm text-ink-muted">The link may be old or mistyped.</p>
    </div>
  )
}

export default function NotFoundPage() {
  const { user } = useAuth()
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-lavender px-4 text-center">
      <LogoMark decorative className="mb-6 h-24" />
      <h1 className="text-2xl font-semibold text-purple-dark">Page not found</h1>
      <p className="mt-1 text-sm text-ink-muted">We could not find what you were looking for.</p>
      <LinkButton to={user ? HOME[user.role] : '/login'} variant="primary" className="mt-5">
        {user ? 'Back to dashboard' : 'Go to sign in'}
      </LinkButton>
    </main>
  )
}
