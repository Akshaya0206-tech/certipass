import { useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { PassportLoader } from '../components/passport/PassportLoader'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'
import { SubmissionWizard } from '../components/wizard/SubmissionWizard'
import { useStudent } from '../hooks/useData'
import { getDraftById } from '../services/submissionService'
import type { AchievementDraft } from '../types'

/**
 * The submission wizard, either blank or continuing a saved draft
 * (`/student/achievements/new?draft=<id>`). Drafts are looked up for the
 * signed-in student only, so another student's draft id resolves to "not found".
 */
export default function AddAchievementPage() {
  return (
    <PassportLoader label="Preparing the form">
      <AddAchievement />
    </PassportLoader>
  )
}

function AddAchievement() {
  const student = useStudent()
  const [params, setParams] = useSearchParams()
  const draftId = params.get('draft')
  // A draft created during this visit is "adopted": its id goes into the URL
  // (so a refresh reopens it) without remounting the wizard and losing the file.
  const adopted = useRef<string | null>(null)
  // The draft the wizard was opened with. Kept so the wizard stays mounted after
  // the draft is consumed by a successful submission, until it navigates away.
  const opened = useRef<AchievementDraft | null>(null)

  if (draftId && draftId !== adopted.current) {
    if (opened.current?.id !== draftId) opened.current = getDraftById(student.id, draftId)
    const draft = opened.current
    if (!draft) {
      return (
        <div className="space-y-6">
          <Breadcrumbs items={[{ label: 'Dashboard', to: '/student' }, { label: 'My Achievements', to: '/student/achievements' }, { label: 'Draft not found' }]} />
          <div className="paper">
            <EmptyState
              icon={FileQuestion}
              title="Draft not found"
              body="This draft doesn’t exist in your passport. It may have been deleted, already submitted, or the link may be wrong."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink to="/student/achievements/new">Start a new achievement</ButtonLink>
                  <ButtonLink to="/student/achievements" variant="secondary">My Achievements</ButtonLink>
                </div>
              }
            />
          </div>
        </div>
      )
    }
    return <SubmissionWizard key={draft.id} mode={{ kind: 'draft', draft }} />
  }

  return (
    <SubmissionWizard
      key="new"
      mode={{ kind: 'create' }}
      onDraftCreated={(id) => {
        adopted.current = id
        setParams({ draft: id }, { replace: true })
      }}
    />
  )
}
