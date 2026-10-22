import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer, ScrollText } from 'lucide-react'
import { OdPassDocument } from '../components/OdPassDocument'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'
import { useUser } from '../context/AuthContext'
import { useAppState } from '../hooks/useData'
import { getPassSource } from '../services/odService'

/** Shared by all three roles; the service decides whether the actor may see the pass. */
export default function PassPage() {
  const { id = '' } = useParams()
  const user = useUser()
  const state = useAppState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const app = useMemo(() => getPassSource(id), [id, state])
  const back = user.role === 'admin' ? '/admin/passes' : `/${user.role}/passes`

  function print() {
    const previous = document.title
    if (app?.passNumber) document.title = app.passNumber
    const restore = () => {
      document.title = previous
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  if (!app) {
    return (
      <div className="panel">
        <EmptyState
          icon={ScrollText}
          title="No approved pass for this application"
          body="A pass exists only for an application that has been approved, and only the student or the reviewing office can open it."
          action={
            <Link to={back} className="font-semibold text-purple underline">
              Back to passes
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Back to passes
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={print}>
            <Download className="size-4" aria-hidden /> Download PDF
          </Button>
          <Button variant="secondary" onClick={print}>
            <Printer className="size-4" aria-hidden /> Print Pass
          </Button>
        </div>
      </div>
      <p className="no-print mb-4 text-xs text-ink-muted">To save a PDF, choose “Save as PDF” as the destination in the print dialog. The page prints on A4 with a white background.</p>
      <div className="print-root -mx-4 overflow-x-auto bg-lavender-deep px-4 py-5 sm:mx-0 sm:rounded-md sm:px-6 print:m-0 print:bg-white print:p-0">
        <OdPassDocument app={app} />
      </div>
    </div>
  )
}
