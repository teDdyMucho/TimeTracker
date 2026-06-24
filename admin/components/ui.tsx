import type { ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border border-line p-6',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),_0_1px_2px_rgba(0,0,0,0.03)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  href,
  alert,
  iconBg,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  href?: string
  alert?: boolean
  iconBg?: string
}) {
  const inner = (
    <div
      className={clsx(
        'bg-white rounded-2xl border p-6 transition-all duration-300',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)]',
        alert ? 'border-amber-100' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between mb-5">
        <div
          className={clsx(
            'w-11 h-11 rounded-xl flex items-center justify-center',
            iconBg ?? (alert ? 'bg-amber-50' : 'bg-brand/10'),
          )}
        >
          {icon}
        </div>
      </div>
      <div className="text-[2rem] font-bold text-ink tracking-tight leading-none mb-2">
        {value}
      </div>
      <div className="text-[11px] font-semibold text-muted uppercase tracking-widest">
        {title}
      </div>
      {subtitle && (
        <div className="text-xs text-muted mt-1.5 truncate">{subtitle}</div>
      )}
    </div>
  )

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

// ─── Page Header ──────────────────────────────────────────────────────────────

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
    <div className="flex items-start justify-between mb-7">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-muted text-sm mt-1 font-medium">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, string> = {
  submitted:  'bg-blue-50    text-blue-700',
  approved:   'bg-brand/10   text-brand',
  rejected:   'bg-red-50     text-red-700',
  locked:     'bg-stone      text-muted',
  pending:    'bg-amber-50   text-amber-700',
  draft:      'bg-stone      text-muted',
  finalised:  'bg-brand/10   text-brand',
  paid:       'bg-brand/10   text-brand',
  failed:     'bg-red-50     text-red-700',
  active:     'bg-brand/10   text-brand',
  inactive:   'bg-stone      text-muted',
  none:       'bg-stone      text-faint',
  admin:      'bg-violet-50  text-violet-700',
  employee:   'bg-sky-50     text-sky-700',
  full_time:  'bg-brand/10   text-brand',
  part_time:  'bg-indigo-50  text-indigo-600',
  contractor: 'bg-orange-50  text-orange-700',
}

export function Badge({ status }: { status: string }) {
  const display = status.replace(/_/g, ' ')
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize',
        BADGE_STYLES[status] ?? 'bg-stone text-muted',
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
      {display}
    </span>
  )
}

// ─── Button ───────────────────────────────────────────────────────────────────

export function Button({
  label,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled,
  className,
  onClick,
  loading,
}: {
  label: string
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  onClick?: () => void
  loading?: boolean
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 active:scale-[0.97]'
  const sizes = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
  }
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm hover:shadow-glow-brand',
    ghost:   'bg-stone text-ink hover:bg-line',
    danger:  'bg-red-50 text-red-700 hover:bg-red-100',
  }
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={clsx(base, sizes[size], variants[variant], className)}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {label}
    </button>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

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
          <tr className="border-b border-line">
            {headers.map((h) => (
              <th
                key={h}
                className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone">{children}</tbody>
      </table>
      {empty && (
        <div className="py-12 text-center text-muted text-sm">{empty}</div>
      )}
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string },
) {
  const { label, className, ...rest } = props
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">
          {label}
        </span>
      )}
      <input
        className={clsx(
          'w-full border border-line rounded-xl px-4 py-2.5 text-ink text-sm placeholder-faint bg-white',
          'focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 transition-all duration-200',
          className,
        )}
        {...rest}
      />
    </label>
  )
}

// ─── Select ───────────────────────────────────────────────────────────────────

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string
    children: ReactNode
  },
) {
  const { label, className, children, ...rest } = props
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">
          {label}
        </span>
      )}
      <select
        className={clsx(
          'w-full border border-line rounded-xl px-4 py-2.5 text-ink text-sm bg-white',
          'focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 transition-all duration-200',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">
      {title}
    </h2>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  children,
  onClose,
}: {
  children: ReactNode
  onClose?: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(31,29,26,0.50)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-modal animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
