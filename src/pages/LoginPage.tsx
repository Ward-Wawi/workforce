import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import {
  buttonPrimaryClassName,
  ErrorAlert,
  FormField,
  inputClassName,
} from '@/components/FormField'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await signIn(email, password)
    setLoading(false)

    if (signInError) {
      setError(signInError)
      return
    }

    navigate('/dashboard')
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage time tracking and payroll."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorAlert message={error} />}

        <FormField label="Email" id="email">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className={inputClassName}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>

        <FormField label="Password" id="password">
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClassName}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>

        <button type="submit" disabled={loading} className={buttonPrimaryClassName}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
