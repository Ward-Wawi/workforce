import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-12">
      <div className="mb-8 text-center">
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            E
          </span>
          <span className="text-xl font-semibold text-slate-900">Emporio</span>
        </Link>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>

      {footer && <div className="mt-6 text-sm text-slate-500">{footer}</div>}
    </div>
  )
}
