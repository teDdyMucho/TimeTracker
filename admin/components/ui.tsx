import type { ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('bg-white rounded-2xl border border-slate-100 p-5 shadow-sm', className)}>
      {children}
    </div>
  )
}

// ─── Stats Card ──────────────────────────────────────────────────────────────

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  href,
  alert,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  href?: string
  alert?: boolean
}) {
  const inner = (
    <div className={clsx('bg-white rounded-2xl border p-5 shadow-sm', alert ? 'border-amber-200' : 'border-slate-100')}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold text-ink">{value}</div>
      {subtitle && <div className="text-xs text-muted mt-1">{subtitle}</div>}
    </div>
  )

  return href ? (
    <Link href={href} className="block hover:opacity-90 transition-opacity">
      {inner}
    </Link>
  ) : (
    inner
  )
}

// ─── Page Header ─────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, string> = {
  submitted: 'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  locked: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-50 text-amber-700',
  draft: 'bg-slate-100 text-slate-600',
  finalised: 'bg-green-50 text-green-700',
  paid: 'bg-brand/10 text-brand',
  failed: 'bg-red-50 text-red-700',
  active: 'bg-green-50 text-green-700',
  inactive: 'bg-slate-100 text-slate-500',
  none: 'bg-slate-50 text-slate-400',
}

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-block px-2 py-0.5 rounded-md text-xs font-medium capitalize',
        BADGE_STYLES[status] ?? 'bg-slate-100 text-slate-600',
      )}
    >
      {status}
    </span>
  )
}

// ─── Button ──────────────────────────────────────────────────────────────────

export function Button({
  label,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled,
  className,
  onClick,
}: {
  label: string
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  onClick?: () => void
}) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-colors disabled:opacity-50'
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm' }
  const variants = {
    primary: 'bg-brand text-white hover:bg-teal-500',
    ghost: 'bg-slate-100 text-ink hover:bg-slate-200',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100',
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(base, sizes[size], variants[variant], className)}
    >
      {label}
    </button>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────

export function Table({
  headers,
  children,
  empty,
}: {
  headers: string[]
  children: ReactNode
  empty?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-100">
            {headers.map((h) => (
              <th key={h} className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {children}
        </tbody>
      </table>
      {empty && (
        <div className="py-12 text-center text-muted text-sm">{empty}</div>
      )}
    </div>
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const { label, className, ...rest } = props
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-ink mb-1">{label}</span>}
      <input
        className={clsx(
          'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-ink text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent',
          className,
        )}
        {...rest}
      />
    </label>
  )
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; children: ReactNode },
) {
  const { label, className, children, ...rest } = props
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-ink mb-1">{label}</span>}
      <select
        className={clsx(
          'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  )
}
