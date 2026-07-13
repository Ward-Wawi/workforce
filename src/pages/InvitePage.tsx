import { useEffect, useState, type FormEvent } from 'react'
import { PageContent, PageHeader } from '@/components/AppLayout'
import {
  buttonPrimaryClassName,
  ErrorAlert,
  FormField,
  inputClassName,
  selectClassName,
  SuccessAlert,
} from '@/components/FormField'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/context/OrganizationContext'
import {
  formatRole,
  INVITE_ROLES,
  isAdminRole,
  type MembershipRole,
} from '@/types/database'

type TeamMember = {
  membership_id: string
  user_id: string
  email: string
  role: MembershipRole
  joined_at: string
}

export function InvitePage() {
  const { currentOrg, currentMembership, inviteToOrganization } = useOrganization()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MembershipRole>('employee')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)

  const isAdmin = currentMembership
    ? isAdminRole(currentMembership.role)
    : false

  useEffect(() => {
    if (!currentOrg || !isAdmin) return

    async function loadTeam() {
      setTeamLoading(true)
      const { data, error: fetchError } = await supabase.rpc(
        'get_organization_members',
        { p_organization_id: currentOrg!.id },
      )

      if (fetchError) {
        console.error(fetchError.message)
        setTeam([])
      } else {
        setTeam((data ?? []) as TeamMember[])
      }
      setTeamLoading(false)
    }

    void loadTeam()
  }, [currentOrg, isAdmin, success])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { error: inviteError } = await inviteToOrganization(email, role)
    setLoading(false)

    if (inviteError) {
      setError(inviteError)
      return
    }

    setSuccess(`${email} has been added to ${currentOrg?.name}.`)
    setEmail('')
  }

  return (
    <>
      <PageHeader
        title="Invite Team"
        description="Add colleagues who already have an Emporio account."
      />
      <PageContent>
        <div className="grid max-w-4xl gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Send invite</h2>
            <p className="mt-1 text-sm text-slate-500">
              The person must sign up first. Then enter their email here to grant
              access to your organization.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <ErrorAlert message={error} />}
              {success && <SuccessAlert message={success} />}

              <FormField label="Email address" id="invite-email">
                <input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  className={inputClassName}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>

              <FormField label="Role" id="invite-role">
                <select
                  id="invite-role"
                  className={selectClassName}
                  value={role}
                  onChange={(e) => setRole(e.target.value as MembershipRole)}
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <button
                type="submit"
                disabled={loading}
                className={buttonPrimaryClassName}
              >
                {loading ? 'Inviting…' : 'Add to organization'}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Team members</h2>
            <p className="mt-1 text-sm text-slate-500">
              People with access to {currentOrg?.name}.
            </p>

            <div className="mt-6 divide-y divide-slate-100">
              {teamLoading && (
                <p className="text-sm text-slate-500">Loading team…</p>
              )}
              {!teamLoading && team.length === 0 && (
                <p className="text-sm text-slate-500">No team members yet.</p>
              )}
              {team.map((member) => (
                <div
                  key={member.membership_id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {member.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {formatRole(member.role)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageContent>
    </>
  )
}
