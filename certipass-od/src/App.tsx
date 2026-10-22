import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui/States'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AppShell } from './layouts/AppShell'
import { GuestOnly, RequireRole } from './layouts/RequireRole'
import LoginPage from './pages/LoginPage'
import NotFoundPage, { WorkspaceNotFound } from './pages/NotFoundPage'

// Workspace pages load per route so the sign-in screen stays light.
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'))
const ApplyPage = lazy(() => import('./pages/student/ApplyPage'))
const ConfirmationPage = lazy(() => import('./pages/student/ConfirmationPage'))
const MyApplicationsPage = lazy(() => import('./pages/student/MyApplicationsPage'))
const ApplicationDetailPage = lazy(() => import('./pages/student/ApplicationDetailPage'))
const StudentPassesPage = lazy(() => import('./pages/student/PassesPage'))
const HistoryPage = lazy(() => import('./pages/student/HistoryPage'))
const FacultyDashboard = lazy(() => import('./pages/faculty/FacultyDashboard'))
const QueuePage = lazy(() => import('./pages/faculty/QueuePage'))
const ReviewPage = lazy(() => import('./pages/faculty/ReviewPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage'))
const PassPage = lazy(() => import('./pages/PassPage'))
const PassRecordsPage = lazy(() => import('./pages/PassRecordsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

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
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />

              <Route element={<RequireRole role="student" />}>
                <Route path="/student" element={<AppShell />}>
                  <Route index element={<StudentDashboard />} />
                  <Route path="apply" element={<ApplyPage />} />
                  <Route path="apply/submitted/:id" element={<ConfirmationPage />} />
                  <Route path="apply/:id" element={<ApplyPage />} />
                  <Route path="applications" element={<MyApplicationsPage />} />
                  <Route path="applications/:id" element={<ApplicationDetailPage />} />
                  <Route path="passes" element={<StudentPassesPage />} />
                  <Route path="passes/:id" element={<PassPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="*" element={<WorkspaceNotFound />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="faculty" />}>
                <Route path="/faculty" element={<AppShell />}>
                  <Route index element={<FacultyDashboard />} />
                  <Route path="pending" element={<QueuePage mode="pending" />} />
                  <Route path="applications" element={<QueuePage mode="all" />} />
                  <Route path="applications/:id" element={<ReviewPage />} />
                  <Route path="passes" element={<PassRecordsPage />} />
                  <Route path="passes/:id" element={<PassPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="*" element={<WorkspaceNotFound />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<AppShell />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="passes" element={<PassRecordsPage />} />
                  <Route path="passes/:id" element={<PassPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="applications/:id" element={<ReviewPage />} />
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
