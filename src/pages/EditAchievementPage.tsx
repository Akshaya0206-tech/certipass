import { useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { PassportLoader } from '../components/passport/PassportLoader'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'
import { StatusBadge } from '../components/ui/StatusBadge'
import { SubmissionWizard } from '../components/wizard/SubmissionWizard'
import { canStudentEdit } from '../domain/status'
import { useStudent } from '../hooks/useData'
import { useMyAchievements } from '../hooks/usePassport'
import { getAchievementById } from '../services/passportService'
import type { Achievement } from '../types'
import { AchievementNotFound } from './AchievementDetailPage'

/**
 * Edit: the same wizard, prefilled from one of the student's own records.
 * Only the owner can open it, and nothing has to be approved afterwards —
 * the correction simply becomes part of the record. Archived records are
 * locked, because only the records office can bring one back.
 */
export default function EditAchievementPage() {
  return (
    <PassportLoader label="Loading achievement">
      <EditGate />
    </PassportLoader>
  )
}

function EditGate() {
  const { id = '' } = useParams()
  const student = useStudent()
  const mine = useMyAchievements()
  const a = getAchievementById(student.id, id, mine)
  // Keep the record the wizard started from, so the wizard stays mounted
  // until it navigates away even as the record updates underneath it.
  const started = useRef<Achievement | null>(null)

  if (!a) return <AchievementNotFound />
  if (started.current?.id !== a.id) started.current = canStudentEdit(a.status) ? a : null

  if (!started.current) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'My Achievements', to: '/student/achievements' }, { label: a.eventName, to: `/student/achievements/${a.id}` }, { label: 'Edit' }]} />
        <div className="paper">
          <EmptyState
            icon={Lock}
            title="This achievement can’t be edited"
            body={
              <>
                It is <StatusBadge status={a.status} className="mx-0.5 align-middle" /> by the Office of Academic Records. Its details are kept in full, but they can no
                longer be changed here. Contact the records office if it needs to be reinstated.
              </>
            }
            action={<ButtonLink to={`/student/achievements/${a.id}`} variant="secondary">Back to the achievement</ButtonLink>}
          />
        </div>
      </div>
    )
  }
  return <SubmissionWizard key={a.id} mode={{ kind: 'edit', achievement: started.current }} />
}
