import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import {
  buttonPrimaryClassName,
  ErrorAlert,
  FormField,
  inputClassName,
  selectClassName,
} from '@/components/FormField'
import { useOrganization } from '@/context/OrganizationContext'
import { INDUSTRIES, TIMEZONES } from '@/types/database'

export function CreateOrganizationPage() {
  const navigate = useNavigate()
  const { createOrganization } = useOrganization()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [industry, setIndustry] = useState<string>('warehouse')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: createError } = await createOrganization({
      name,
      timezone,
      industry,
    })

    setLoading(false)

    if (createError) {
      setError(createError)
      return
    }

    navigate('/dashboard')
  }

  return (
    <AuthLayout
      title="Set up your organization"
      subtitle="Tell us about your business. You’ll be the owner with full access."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorAlert message={error} />}

        <FormField label="Organization name" id="name">
          <input
            id="name"
            type="text"
            required
            placeholder="Acme Warehouse"
            className={inputClassName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>

        <FormField label="Timezone" id="timezone">
          <select
            id="timezone"
            required
            className={selectClassName}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Industry" id="industry">
          <select
            id="industry"
            className={selectClassName}
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            {INDUSTRIES.map((item) => (
              <option key={item} value={item}>
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
        </FormField>

        <button type="submit" disabled={loading} className={buttonPrimaryClassName}>
          {loading ? 'Creating organization…' : 'Create organization'}
        </button>
      </form>
    </AuthLayout>
  )
}
