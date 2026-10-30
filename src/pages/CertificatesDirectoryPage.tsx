import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import { UploadStatistics } from '../components/admin/UploadStatistics'
import { CertificateDetailsDialog, certificateName } from '../components/CertificateDetailsDialog'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { Dialog } from '../components/ui/Dialog'
import { FilterBar, FilterSelect, SearchInput } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States'
import { useToast } from '../context/ToastContext'
import { batchLabel } from '../domain/batch'
import { useCertificateList } from '../hooks/useCertificateList'
import { useRequiredUser } from '../hooks/useData'
import { formatDate } from '../lib/format'
import { downloadCertificate, removeCertificate, storageAvailability, storageErrorMessage, UNAVAILABLE_COPY } from '../services/certificateStorage'
import type { ListedCertificate } from '../services/certificateStorage'
import { formatBytes } from '../services/fileService'
import { ACHIEVEMENT_CATEGORIES } from '../types'

/*
 * Student certificates, for faculty and administrators.
 *
 * What appears is decided by the server from the signed-in person's role, not by this page: faculty get students in
 * the departments they cover, an administrator gets everyone. Search and the filters can only narrow that further.
 * Files are fetched through the authenticated storage API, so there is no link to share or leak.
 */

const PAGE_SIZE = 25
const ALL = 'all'

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

export default function CertificatesDirectoryPage() {
  const user = useRequiredUser()
  const toast = useToast()
  const isAdmin = user.role === 'admin'
  const availability = storageAvailability()
  const ready = availability === 'ready'

  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState(ALL)
  const [batch, setBatch] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())

  const [viewing, setViewing] = useState<ListedCertificate | null>(null)
  const [removing, setRemoving] = useState<ListedCertificate | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [statsKey, setStatsKey] = useState(0)

  const list = useCertificateList(
    {
      q: q || undefined,
      department: department === ALL ? undefined : department,
      batch: batch === ALL ? undefined : batch,
      category: category === ALL ? undefined : category,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    ready,
  )
  // Any change to what is asked for starts again at the first page.
  useEffect(() => setPage(1), [q, department, batch, category])

  const facets = list.data?.facets ?? { departments: [], batches: [] }
  const departmentOptions = useMemo(() => [{ value: ALL, label: 'All departments' }, ...facets.departments.map((d) => ({ value: d, label: d }))], [facets.departments])
  const batchOptions = useMemo(() => [{ value: ALL, label: 'All batches' }, ...facets.batches.map((b) => ({ value: b, label: batchLabel(b) }))], [facets.batches])
  const categoryOptions = useMemo(() => [{ value: ALL, label: 'All categories' }, ...ACHIEVEMENT_CATEGORIES.map((c) => ({ value: c as string, label: c }))], [])

  const filtered = q !== '' || department !== ALL || batch !== ALL || category !== ALL
  const reset = () => {
    setSearch('')
    setDepartment(ALL)
    setBatch(ALL)
    setCategory(ALL)
  }

  async function download(c: ListedCertificate) {
    setBusy(c.id)
    try {
      await downloadCertificate(c.id, c.fileName)
    } catch (err) {
      toast.error('Download failed', storageErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setBusy(removing.id)
    try {
      await removeCertificate(removing.id)
      toast.success('Certificate removed', 'Its file is in the Google Drive bin for 30 days.')
      setRemoving(null)
      list.reload()
      setStatsKey((k) => k + 1)
    } catch (err) {
      toast.error('Could not remove the certificate', storageErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<ListedCertificate>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (c) => (
        <div className="min-w-0">
          <p className="max-w-[14rem] truncate font-medium text-navy-900">{c.studentName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{c.registerNumber}</p>
        </div>
      ),
    },
    { key: 'department', header: 'Department', hideBelow: 'md', render: (c) => c.department || '—' },
    { key: 'batch', header: 'Batch', hideBelow: 'lg', render: (c) => batchLabel(c.batch) },
    {
      key: 'certificate',
      header: 'Certificate',
      render: (c) => (
        <div className="min-w-0">
          <p className="max-w-[16rem] truncate text-navy-900">{certificateName(c)}</p>
          <p className="text-[11.5px] text-ink-muted">{c.category}</p>
        </div>
      ),
    },
    { key: 'issuer', header: 'Issued by', hideBelow: 'lg', render: (c) => c.issuer || '—' },
    { key: 'uploaded', header: 'Uploaded', hideBelow: 'sm', render: (c) => (c.uploadedAt ? formatDate(c.uploadedAt) : '—') },
    { key: 'size', header: 'Size', hideBelow: 'lg', render: (c) => formatBytes(c.sizeBytes) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (c) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setViewing(c)} icon={<Eye className="size-3.5" aria-hidden />}>
            Preview<span className="sr-only">: {certificateName(c)} by {c.studentName}</span>
          </Button>
          <Button size="sm" variant="secondary" loading={busy === c.id && !removing} onClick={() => void download(c)} icon={<Download className="size-3.5" aria-hidden />}>
            Download<span className="sr-only">: {certificateName(c)} by {c.studentName}</span>
          </Button>
          {isAdmin && (
            <Button size="sm" variant="danger" onClick={() => setRemoving(c)} icon={<Trash2 className="size-3.5" aria-hidden />}>
              Remove<span className="sr-only">: {certificateName(c)} by {c.studentName}</span>
            </Button>
          )}
        </div>
      ),
    },
  ]

  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={isAdmin ? 'Records administration' : 'Faculty records'}
        title="Student Certificates"
        description={
          isAdmin
            ? 'Every certificate students have uploaded. Files are stored privately in the college’s Google Drive and are opened here, never through a public link.'
            : 'Certificates uploaded by students in the departments you review. Search by student name or ID, and filter by department, batch or category.'
        }
      />

      {!ready ? (
        <ErrorState title={UNAVAILABLE_COPY[availability as 'unconfigured' | 'no_session'].title} body={UNAVAILABLE_COPY[availability as 'unconfigured' | 'no_session'].reason} />
      ) : (
        <>
          {isAdmin && <UploadStatistics refreshKey={statsKey} />}

          <section aria-label="Certificates" className="space-y-3">
            <FilterBar onReset={reset} active={filtered} resultLabel={list.data ? `${total} ${total === 1 ? 'certificate' : 'certificates'}` : undefined}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search student name, ID, title or issuer" label="Search certificates" className="md:w-80" />
              <FilterSelect label="Department" value={department} onChange={setDepartment} options={departmentOptions} className="md:w-44" />
              <FilterSelect label="Batch" value={batch} onChange={setBatch} options={batchOptions} className="md:w-36" />
              <FilterSelect label="Category" value={category} onChange={setCategory} options={categoryOptions} className="md:w-44" />
            </FilterBar>

            {list.status === 'loading' && !list.data && <LoadingRows label="Loading certificates" />}
            {list.status === 'error' && (
              <ErrorState
                title="Couldn’t load the certificates"
                body={list.error.message}
                action={
                  <Button size="sm" variant="secondary" onClick={list.reload} icon={<RefreshCw className="size-3.5" aria-hidden />}>
                    Try again
                  </Button>
                }
              />
            )}
            {list.data && list.status !== 'error' && (
              <>
                <DataTable
                  caption="Student certificates"
                  columns={columns}
                  rows={list.data.certificates}
                  rowKey={(c) => c.id}
                  className={list.status === 'loading' ? 'opacity-60' : undefined}
                  empty={
                    <EmptyState
                      icon={FolderOpen}
                      title={filtered ? 'No certificates match' : 'No certificates yet'}
                      body={filtered ? 'Try a different search, or clear the filters.' : 'Certificates will appear here as students upload them.'}
                      action={
                        filtered ? (
                          <Button size="sm" variant="secondary" onClick={reset}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                />
                <Pagination page={page} pageCount={pageCount} from={total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to={Math.min(page * PAGE_SIZE, total)} total={total} onPage={setPage} noun="certificates" />
              </>
            )}
          </section>
        </>
      )}

      <CertificateDetailsDialog item={viewing} showStudent onClose={() => setViewing(null)} />

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove this certificate?"
        description={removing ? `${certificateName(removing)} · ${removing.studentName} (${removing.registerNumber})` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={!!removing && busy === removing.id} onClick={() => void confirmRemove()}>
              Remove certificate
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          The student will no longer see it, and it disappears from this list. The file is moved to the Google Drive bin, where it can be recovered for 30 days.
        </p>
      </Dialog>
    </div>
  )
}
