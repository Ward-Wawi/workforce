import { useEffect, useState, type FormEvent } from 'react'
import { PageContent, PageHeader } from '@/components/AppLayout'
import {
  buttonPrimaryClassName,
  ErrorAlert,
  FormField,
  inputClassName,
  SuccessAlert,
} from '@/components/FormField'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/context/OrganizationContext'
import type { OrgSettings } from '@/types/database'

export function DashboardPage() {
  const { currentOrg, currentMembership } = useOrganization()

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your organization overview — more widgets coming in Phase 3."
      />
      <PageContent>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Organization"
            value={currentOrg?.name ?? '—'}
            detail={currentOrg?.timezone ?? ''}
          />
          <StatCard
            label="Your role"
            value={
              currentMembership?.role
                ? currentMembership.role.charAt(0).toUpperCase() +
                  currentMembership.role.slice(1)
                : '—'
            }
            detail="Access level"
          />
          <StatCard
            label="Subscription"
            value={currentOrg?.subscription_status ?? '—'}
            detail={currentOrg?.subscription_plan ?? 'Trial'}
          />
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Phase 1 complete</h2>
          <p className="mt-2 text-sm text-slate-600">
            Auth, organization setup, and team invites are working. Next up: employee
            clock-in/out (PIN + QR), breaks, and timesheets.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Supabase Auth (signup / login)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Organization creation with owner membership
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Team invite by email
            </li>
            <li className="flex items-center gap-2">
              <span className="text-slate-400">○</span> Clock in / out (Phase 2)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-slate-400">○</span> Admin dashboard widgets (Phase 3)
            </li>
          </ul>
        </div>
      </PageContent>
    </>
  )
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  )
}

export function SettingsPage() {
  const { currentOrg } = useOrganization()
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrg) return

    async function loadSettings() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrg!.id)
        .single()

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setSettings(data as OrgSettings)
      }
      setLoading(false)
    }

    void loadSettings()
  }, [currentOrg])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!settings || !currentOrg) return

    setError(null)
    setSuccess(null)
    setSaving(true)

    const { error: updateError } = await supabase
      .from('settings')
      .update({
        grace_period_minutes: settings.grace_period_minutes,
        late_after_minutes: settings.late_after_minutes,
        overtime_after_hours: settings.overtime_after_hours,
        daily_overtime_after_hours: settings.daily_overtime_after_hours,
        double_time_after_hours: settings.double_time_after_hours,
        weekend_rate_multiplier: settings.weekend_rate_multiplier,
        holiday_rate_multiplier: settings.holiday_rate_multiplier,
        automatic_overtime: settings.automatic_overtime,
      })
      .eq('organization_id', currentOrg.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Attendance settings saved.')
  }

  function updateNumber(field: keyof OrgSettings, value: string) {
    if (!settings) return
    const parsed = value === '' ? null : Number(value)
    setSettings({ ...settings, [field]: parsed })
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Settings" description="Configure attendance and pay rules." />
        <PageContent>
          <p className="text-sm text-slate-500">Loading settings…</p>
        </PageContent>
      </>
    )
  }

  if (!settings) {
    return (
      <>
        <PageHeader title="Settings" description="Configure attendance and pay rules." />
        <PageContent>
          {error && <ErrorAlert message={error} />}
        </PageContent>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Attendance rules for your organization."
      />
      <PageContent>
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-6 rounded-xl border border-slate-200 bg-white p-6"
        >
          {error && <ErrorAlert message={error} />}
          {success && <SuccessAlert message={success} />}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Attendance</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="Grace period (minutes)" id="grace">
                <input
                  id="grace"
                  type="number"
                  min={0}
                  className={inputClassName}
                  value={settings.grace_period_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      grace_period_minutes: Number(e.target.value),
                    })
                  }
                />
              </FormField>
              <FormField label="Late after (minutes)" id="late">
                <input
                  id="late"
                  type="number"
                  min={0}
                  className={inputClassName}
                  value={settings.late_after_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      late_after_minutes: Number(e.target.value),
                    })
                  }
                />
              </FormField>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Overtime</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="Weekly OT threshold (hours)" id="ot-weekly">
                <input
                  id="ot-weekly"
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputClassName}
                  value={settings.overtime_after_hours}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      overtime_after_hours: Number(e.target.value),
                    })
                  }
                />
              </FormField>
              <FormField label="Daily OT threshold (hours)" id="ot-daily">
                <input
                  id="ot-daily"
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputClassName}
                  value={settings.daily_overtime_after_hours ?? ''}
                  onChange={(e) =>
                    updateNumber('daily_overtime_after_hours', e.target.value)
                  }
                />
              </FormField>
              <FormField label="Double time after (hours)" id="dt">
                <input
                  id="dt"
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputClassName}
                  value={settings.double_time_after_hours ?? ''}
                  onChange={(e) =>
                    updateNumber('double_time_after_hours', e.target.value)
                  }
                />
              </FormField>
              <FormField label="Weekend rate multiplier" id="weekend">
                <input
                  id="weekend"
                  type="number"
                  min={1}
                  step={0.1}
                  className={inputClassName}
                  value={settings.weekend_rate_multiplier}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      weekend_rate_multiplier: Number(e.target.value),
                    })
                  }
                />
              </FormField>
              <FormField label="Holiday rate multiplier" id="holiday">
                <input
                  id="holiday"
                  type="number"
                  min={1}
                  step={0.1}
                  className={inputClassName}
                  value={settings.holiday_rate_multiplier}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      holiday_rate_multiplier: Number(e.target.value),
                    })
                  }
                />
              </FormField>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.automatic_overtime}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    automatic_overtime: e.target.checked,
                  })
                }
                className="rounded border-slate-300"
              />
              Automatically calculate overtime
            </label>
          </section>

          <button type="submit" disabled={saving} className={buttonPrimaryClassName}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </PageContent>
    </>
  )
}
