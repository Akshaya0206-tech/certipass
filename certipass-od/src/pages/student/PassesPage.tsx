import { ScrollText } from 'lucide-react'
import { PassesTable } from '../../components/PassesTable'
import { LinkButton } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { useApplications } from '../../hooks/useData'

export default function StudentPassesPage() {
  const apps = useApplications()
  return (
    <div>
      <PageHeader title="Approved passes" description="A pass is created only when a faculty member or administrator approves your application." />
      <div className="panel">
        <PassesTable
          apps={apps}
          role="student"
          empty={<EmptyState icon={ScrollText} title="No approved passes yet" body="Once an application is approved, its printable pass appears here." action={<LinkButton to="/student/applications" variant="secondary">View my applications</LinkButton>} />}
        />
      </div>
    </div>
  )
}
