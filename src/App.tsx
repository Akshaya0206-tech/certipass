import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Spinner } from './components/ui/States'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AppShell } from './layouts/AppShell'
import { GuestOnly, RequireRole } from './layouts/RequireRole'
import StudentLoginPage from './pages/StudentLoginPage'
import StudentRegisterPage from './pages/StudentRegisterPage'
import FacultyLoginPage from './pages/FacultyLoginPage'
import AdminLoginPage from './pages/AdminLoginPage'
import NotFoundPage, { WorkspaceNotFound } from './pages/NotFoundPage'

// Workspace pages are split per route so the public pages stay light.
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'))
const AddAchievementPage = lazy(() => import('./pages/AddAchievementPage'))
const AchievementDetailPage = lazy(() => import('./pages/AchievementDetailPage'))
const StudentCertificatesPage = lazy(() => import('./pages/StudentCertificatesPage'))
const CertificatesDirectoryPage = lazy(() => import('./pages/CertificatesDirectoryPage'))
const EditAchievementPage = lazy(() => import('./pages/EditAchievementPage'))
const SubmissionConfirmationPage = lazy(() => import('./pages/SubmissionConfirmationPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const FacultyDashboard = lazy(() => import('./pages/FacultyDashboard'))
const FacultyBatchAchievementsPage = lazy(() => import('./pages/FacultyBatchAchievementsPage'))
const FacultyRecordDetailPage = lazy(() => import('./pages/FacultyRecordDetailPage'))
const FacultyReportsPage = lazy(() => import('./pages/FacultyReportsPage'))
const FacultyStudentsPage = lazy(() => import('./pages/FacultyStudentsPage'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'))
const AdminUserDetailPage = lazy(() => import('./pages/AdminUserDetailPage'))
const FacultyManagementPage = lazy(() => import('./pages/FacultyManagementPage'))
const AcademicConfigPage = lazy(() => import('./pages/AcademicConfigPage'))
const AdminRecordsPage = lazy(() => import('./pages/AdminRecordsPage'))
const AdminRecordDetailPage = lazy(() => import('./pages/AdminRecordDetailPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const AdminActivityPage = lazy(() => import('./pages/AdminActivityPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

/** An old /faculty/review/:id link now opens the ordinary record detail page. */
function LegacyReviewRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/faculty/records/${id}` : '/faculty/batches'} replace />
}

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label="Loading page" />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* The sign-in screen is the entry point; /login is the same screen. */}
              <Route path="/" element={<GuestOnly><StudentLoginPage /></GuestOnly>} />
              <Route path="/login" element={<GuestOnly><StudentLoginPage /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><StudentRegisterPage /></GuestOnly>} />
              <Route path="/faculty/login" element={<GuestOnly><FacultyLoginPage /></GuestOnly>} />
              <Route path="/admin/login" element={<GuestOnly><AdminLoginPage /></GuestOnly>} />

              <Route element={<RequireRole role="student" />}>
                <Route path="/student" element={<AppShell />}>
                  <Route index element={<StudentDashboard />} />
                  <Route path="achievements" element={<AchievementsPage />} />
                  <Route path="achievements/new" element={<AddAchievementPage />} />
                  <Route path="achievements/:id" element={<AchievementDetailPage />} />
                  <Route path="achievements/:id/edit" element={<EditAchievementPage />} />
                  <Route path="achievements/:id/submitted" element={<SubmissionConfirmationPage />} />
                  <Route path="certificates" element={<StudentCertificatesPage />} />
                  <Route path="timeline" element={<TimelinePage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="help" element={<HelpPage />} />
                  <Route path="*" element={<WorkspaceNotFound />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="faculty" />}>
                <Route path="/faculty" element={<AppShell />}>
                  <Route index element={<FacultyDashboard />} />
                  <Route path="students" element={<FacultyStudentsPage />} />
                  <Route path="batches" element={<FacultyBatchAchievementsPage />} />
                  <Route path="records/:id" element={<FacultyRecordDetailPage />} />
                  <Route path="certificates" element={<CertificatesDirectoryPage />} />
                  <Route path="reports" element={<FacultyReportsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  {/*
                    The verification workflow these paths belonged to has been
                    removed. They redirect so old links still land somewhere
                    useful; none of them can reach a review action.
                  */}
                  <Route path="queue" element={<Navigate to="/faculty/batches" replace />} />
                  <Route path="submissions" element={<Navigate to="/faculty/batches" replace />} />
                  <Route path="review/:id" element={<LegacyReviewRedirect />} />
                  <Route path="*" element={<WorkspaceNotFound />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<AppShell />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<UserManagementPage />} />
                  <Route path="users/:id" element={<AdminUserDetailPage />} />
                  <Route path="faculty" element={<FacultyManagementPage />} />
                  <Route path="academics" element={<AcademicConfigPage />} />
                  <Route path="records" element={<AdminRecordsPage />} />
                  <Route path="records/:id" element={<AdminRecordDetailPage />} />
                  <Route path="certificates" element={<CertificatesDirectoryPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="activity" element={<AdminActivityPage />} />
                  {/* Earlier phases used these paths; keep old links working. */}
                  <Route path="departments" element={<Navigate to="/admin/academics" replace />} />
                  <Route path="achievements" element={<Navigate to="/admin/records" replace />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="*" element={<WorkspaceNotFound />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
