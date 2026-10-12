import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
const EditAchievementPage = lazy(() => import('./pages/EditAchievementPage'))
const SubmissionConfirmationPage = lazy(() => import('./pages/SubmissionConfirmationPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const FacultyDashboard = lazy(() => import('./pages/FacultyDashboard'))
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'))
const AllSubmissionsPage = lazy(() => import('./pages/ReviewQueuePage').then((m) => ({ default: m.AllSubmissionsPage })))
const ReviewDetailPage = lazy(() => import('./pages/ReviewDetailPage'))
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
                  <Route path="queue" element={<ReviewQueuePage />} />
                  <Route path="submissions" element={<AllSubmissionsPage />} />
                  <Route path="review/:id" element={<ReviewDetailPage />} />
                  <Route path="students" element={<FacultyStudentsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
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
