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
 * Edit and resubmit: the same wizard, prefilled from a record that needs
 * attention. Only the owner can open it, and only while faculty is waiting
 * on a correction — verified and in-review records are locked.
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
  // Keep the record the wizard started from: once it's resubmitted its status
  // changes, and the wizard must stay mounted until it navigates away.
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
            title="This achievement can’t be edited right now"
            body={
              <>
                It is currently <StatusBadge status={a.status} className="mx-0.5 align-middle" />. You can edit and resubmit only when a reviewer asks for a clarification or correction.
              </>
            }
            action={<ButtonLink to={`/student/achievements/${a.id}`} variant="secondary">Back to the achievement</ButtonLink>}
          />
        </div>
      </div>
    )
  }
  return <SubmissionWizard key={a.id} mode={{ kind: 'resubmit', achievement: started.current }} />
}
