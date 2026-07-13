import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import {
  AdminRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from '@/components/ProtectedRoute'
import { AuthProvider } from '@/context/AuthContext'
import { OrganizationProvider } from '@/context/OrganizationContext'
import { CreateOrganizationPage } from '@/pages/CreateOrganizationPage'
import { DashboardPage, SettingsPage } from '@/pages/DashboardPage'
import { InvitePage } from '@/pages/InvitePage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { useAuth } from '@/context/AuthContext'

function HomeRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/create-organization" element={<CreateOrganizationPage />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route element={<AdminRoute />}>
                <Route path="/invite" element={<InvitePage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </OrganizationProvider>
    </AuthProvider>
  )
}
