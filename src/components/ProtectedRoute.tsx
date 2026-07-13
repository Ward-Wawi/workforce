import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useOrganization } from '@/context/OrganizationContext'

export function ProtectedRoute() {
  const { user, loading: authLoading } = useAuth()
  const { memberships, loading: orgLoading } = useOrganization()
  const location = useLocation()

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const isCreateOrgRoute = location.pathname === '/create-organization'

  if (memberships.length === 0 && !isCreateOrgRoute) {
    return <Navigate to="/create-organization" replace />
  }

  if (memberships.length > 0 && isCreateOrgRoute) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (user) {
    const redirectTo =
      (location.state as { from?: string } | null)?.from ?? '/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { currentMembership, loading } = useOrganization()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  const role = currentMembership?.role
  const isAdmin =
    role === 'owner' || role === 'admin' || role === 'manager'

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
