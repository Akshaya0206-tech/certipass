import { ButtonLink } from '../components/ui/Button'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { homePathFor } from '../services/auth'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-sky px-6 text-center">
      <Logo />
      <p className="label-archival mt-12">Error 404 · page not on file</p>
      <h1 className="display mt-3 text-[29px] leading-tight">This page doesn’t exist.</h1>
      <p className="mt-3 max-w-md text-ink-soft">The address may be mistyped, or the page may have moved.</p>
      <ButtonLink to="/" className="mt-8">
        Go to sign in
      </ButtonLink>
    </main>
  )
}

/** Unknown path inside a signed-in workspace: keep the sidebar, offer a way back. */
export function WorkspaceNotFound() {
  const { currentUser } = useAuth()
  return (
    <div className="flex flex-col items-start py-12">
      <p className="label-archival">Error 404 · page not on file</p>
      <h1 className="display mt-3 text-[23px] leading-tight">This page doesn’t exist.</h1>
      <p className="mt-2 max-w-md text-ink-soft">Check the address, or use the navigation to find what you need.</p>
      {currentUser && (
        <ButtonLink to={homePathFor(currentUser.role)} className="mt-6">
          Go to my dashboard
        </ButtonLink>
      )}
    </div>
  )
}
