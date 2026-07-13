import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import {
  buttonPrimaryClassName,
  ErrorAlert,
  FormField,
  inputClassName,
  SuccessAlert,
} from '@/components/FormField'
import { useAuth } from '@/context/AuthContext'

export function SignupPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: signUpError, needsConfirmation } = await signUp(email, password)
    setLoading(false)

    if (signUpError) {
      setError(signUpError)
      return
    }

    if (needsConfirmation) {
      setSuccess(
        'Account created. Check your email to confirm, then sign in to set up your organization.',
      )
      return
    }

    navigate('/create-organization')
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your free trial — set up your organization next."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorAlert message={error} />}
        {success && <SuccessAlert message={success} />}

        <FormField label="Work email" id="email">
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
            autoComplete="new-password"
            minLength={8}
            className={inputClassName}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>

        <FormField label="Confirm password" id="confirmPassword">
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className={inputClassName}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </FormField>

        <button type="submit" disabled={loading} className={buttonPrimaryClassName}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
