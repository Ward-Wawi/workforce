export type MembershipRole = 'owner' | 'admin' | 'manager' | 'employee'

export type Organization = {
  id: string
  name: string
  timezone: string
  industry: string | null
  subscription_status: string
  subscription_plan: string | null
  seat_count: number
  created_at: string
}

export type Membership = {
  id: string
  user_id: string
  organization_id: string
  role: MembershipRole
  created_at: string
  organization?: Organization
}

export type OrgSettings = {
  id: string
  organization_id: string
  grace_period_minutes: number
  late_after_minutes: number
  overtime_after_hours: number
  daily_overtime_after_hours: number | null
  double_time_after_hours: number | null
  weekend_rate_multiplier: number
  holiday_rate_multiplier: number
  automatic_overtime: boolean
  updated_at: string
}

export const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (US)' },
  { value: 'America/Chicago', label: 'Central (US)' },
  { value: 'America/Denver', label: 'Mountain (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
  { value: 'America/Anchorage', label: 'Alaska (US)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (US)' },
  { value: 'UTC', label: 'UTC' },
] as const

export const INDUSTRIES = [
  'warehouse',
  'manufacturing',
  'retail',
  'healthcare',
  'hospitality',
  'construction',
  'other',
] as const

export const INVITE_ROLES: { value: MembershipRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
]

export function isAdminRole(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export function formatRole(role: MembershipRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
