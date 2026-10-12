import { useMemo, useState } from 'react'
import { ActivityList } from '../components/admin/ActivityList'
import { FilterSelect } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagination } from '../components/ui/Pagination'
import { EmptyState } from '../components/ui/States'
import { useAchievements, useUsers } from '../hooks/useData'
import { ACTIVITY_TYPE_LABEL, getAdminActivity } from '../services/adminService'
import type { AdminActivityType } from '../services/adminService'
import { useStore } from '../services/store'

export default function AdminActivityPage() {
  const achievements = useAchievements()
  const users = useUsers()
  const audit = useStore((s) => s.audit)
  const [type, setType] = useState<AdminActivityType | 'all'>('all')

  const all = useMemo(() => getAdminActivity({ achievements, users, audit }), [achievements, users, audit])
  const items = useMemo(() => (type === 'all' ? all : all.filter((i) => i.type === type)), [all, type])
  const paging = usePagination(items, 15, type)

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Administration · ${all.length} recorded events`}
        title="Activity"
        description="What has happened across CertiPass, newest first: submissions, reviews, corrections, verifications, new accounts and admin actions. Built only from what is recorded on the records, accounts and audit trail."
      />
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect<AdminActivityType | 'all'>
          label="Activity type"
          value={type}
          onChange={setType}
          options={[{ value: 'all', label: 'All activity' }, ...(Object.keys(ACTIVITY_TYPE_LABEL) as AdminActivityType[]).map((t) => ({ value: t, label: ACTIVITY_TYPE_LABEL[t] }))]}
          className="w-56"
        />
        {type !== 'all' && (
          <button type="button" onClick={() => setType('all')} className="text-[13px] font-medium text-terracotta-600 underline-offset-2 hover:underline">
            Clear filter
          </button>
        )}
      </div>
      <div className="paper p-5 sm:p-6">
        {items.length ? <ActivityList items={paging.pageRows} /> : <EmptyState title={type === 'all' ? 'No activity yet' : 'No activity of this type'} body="Events appear here as they happen." className="py-6" />}
      </div>
      <Pagination {...paging} onPage={paging.setPage} noun="events" />
    </div>
  )
}
