import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useOrganization } from '@/context/OrganizationContext'
import { formatRole, isAdminRole } from '@/types/database'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ')

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { currentOrg, currentMembership, memberships, setCurrentOrgId } =
    useOrganization()

  const isAdmin = currentMembership
    ? isAdminRole(currentMembership.role)
    : false

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              E
            </span>
            <div>
              <p className="font-semibold text-slate-900">Emporio</p>
              <p className="truncate text-xs text-slate-500">
                {currentOrg?.name ?? 'Organization'}
              </p>
            </div>
          </div>

          {memberships.length > 1 && (
            <select
              className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={currentOrg?.id ?? ''}
              onChange={(e) => setCurrentOrgId(e.target.value)}
            >
              {memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organization?.name ?? m.organization_id}
                </option>
              ))}
            </select>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/invite" className={navLinkClass}>
                Invite Team
              </NavLink>
              <NavLink to="/settings" className={navLinkClass}>
                Settings
              </NavLink>
            </>
          )}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-900">
            {user?.email}
          </p>
          {currentMembership && (
            <p className="text-xs text-slate-500">
              {formatRole(currentMembership.role)}
            </p>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-8 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return <div className="p-8">{children}</div>
}

export function AuthLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="font-medium text-brand-600 hover:text-brand-700">
      {children}
    </Link>
  )
}
