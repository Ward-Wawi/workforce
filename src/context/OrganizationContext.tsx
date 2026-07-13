import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Membership, MembershipRole, Organization } from '@/types/database'

const ORG_STORAGE_KEY = 'workforce_current_org_id'

type OrganizationContextValue = {
  memberships: Membership[]
  currentOrg: Organization | null
  currentMembership: Membership | null
  loading: boolean
  refreshMemberships: () => Promise<void>
  setCurrentOrgId: (orgId: string) => void
  createOrganization: (input: {
    name: string
    timezone: string
    industry?: string
  }) => Promise<{ error: string | null; organizationId?: string }>
  inviteToOrganization: (
    email: string,
    role: MembershipRole,
  ) => Promise<{ error: string | null }>
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(() =>
    localStorage.getItem(ORG_STORAGE_KEY),
  )
  const [loading, setLoading] = useState(true)

  const refreshMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('memberships')
      .select(
        `
        id,
        user_id,
        organization_id,
        role,
        created_at,
        organization:organizations (
          id,
          name,
          timezone,
          industry,
          subscription_status,
          subscription_plan,
          seat_count,
          created_at
        )
      `,
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to load memberships:', error.message)
      setMemberships([])
    } else {
      setMemberships((data ?? []) as Membership[])
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    void refreshMemberships()
  }, [refreshMemberships])

  useEffect(() => {
    if (memberships.length === 0) {
      setCurrentOrgIdState(null)
      localStorage.removeItem(ORG_STORAGE_KEY)
      return
    }

    const storedOrgStillValid = memberships.some(
      (m) => m.organization_id === currentOrgId,
    )

    if (!currentOrgId || !storedOrgStillValid) {
      const firstOrgId = memberships[0].organization_id
      setCurrentOrgIdState(firstOrgId)
      localStorage.setItem(ORG_STORAGE_KEY, firstOrgId)
    }
  }, [memberships, currentOrgId])

  const setCurrentOrgId = useCallback((orgId: string) => {
    setCurrentOrgIdState(orgId)
    localStorage.setItem(ORG_STORAGE_KEY, orgId)
  }, [])

  const createOrganization = useCallback(
    async (input: { name: string; timezone: string; industry?: string }) => {
      if (!user) {
        return { error: 'You must be signed in to create an organization.' }
      }

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: input.name.trim(),
          timezone: input.timezone,
          industry: input.industry?.trim() || null,
        })
        .select('id')
        .single()

      if (orgError || !org) {
        return { error: orgError?.message ?? 'Failed to create organization.' }
      }

      const { error: membershipError } = await supabase.from('memberships').insert({
        user_id: user.id,
        organization_id: org.id,
        role: 'owner',
      })

      if (membershipError) {
        return { error: membershipError.message }
      }

      setCurrentOrgId(org.id)
      await refreshMemberships()

      return { error: null, organizationId: org.id }
    },
    [user, refreshMemberships, setCurrentOrgId],
  )

  const inviteToOrganization = useCallback(
    async (email: string, role: MembershipRole) => {
      if (!currentOrgId) {
        return { error: 'No organization selected.' }
      }

      const { error } = await supabase.rpc('invite_to_organization', {
        p_organization_id: currentOrgId,
        p_email: email.trim().toLowerCase(),
        p_role: role,
      })

      return { error: error?.message ?? null }
    },
    [currentOrgId],
  )

  const currentMembership = useMemo(
    () => memberships.find((m) => m.organization_id === currentOrgId) ?? null,
    [memberships, currentOrgId],
  )

  const currentOrg = useMemo(
    () => currentMembership?.organization ?? null,
    [currentMembership],
  )

  const value = useMemo(
    () => ({
      memberships,
      currentOrg,
      currentMembership,
      loading,
      refreshMemberships,
      setCurrentOrgId,
      createOrganization,
      inviteToOrganization,
    }),
    [
      memberships,
      currentOrg,
      currentMembership,
      loading,
      refreshMemberships,
      setCurrentOrgId,
      createOrganization,
      inviteToOrganization,
    ],
  )

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider')
  }
  return context
}
