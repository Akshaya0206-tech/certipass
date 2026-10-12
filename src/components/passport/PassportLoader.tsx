import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePassportLoad } from '../../hooks/usePassport'
import { Button } from '../ui/Button'
import { ErrorState, LoadingRows } from '../ui/States'

/** Shows loading and failure states for the simulated passport fetch, then renders the page. */
export function PassportLoader({ children, label = 'Loading your passport' }: { children: ReactNode; label?: string }) {
  const { state, retry } = usePassportLoad()
  if (state.status === 'loading') {
    return (
      <div className="paper">
        <LoadingRows rows={5} label={label} />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <ErrorState
        title="We couldn’t load your passport"
        body={state.message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={retry}>Try again</Button>
            <Link to="/student/help" className="inline-flex h-10 items-center px-3 text-sm font-medium text-navy-800 hover:underline">
              Get help
            </Link>
          </div>
        }
      />
    )
  }
  return <>{children}</>
}
