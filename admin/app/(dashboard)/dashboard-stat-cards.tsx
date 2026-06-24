'use client'
import Link from 'next/link'
import { Users, Clock, Timer, FolderOpen, ArrowUp, ArrowDown } from 'lucide-react'

const ICONS = { users: Users, clock: Clock, timer: Timer, folder: FolderOpen } as const

export interface StatCard {
  label: string
  value: string
  iconName: keyof typeof ICONS
  href: string
  iconBg: string
  iconColor: string
  trend?: { text: string; positive: boolean }
  sub?: string
}

export default function DashboardStatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
      {cards.map((c, i) => {
        const Icon = ICONS[c.iconName]
        return (
          <Link
            key={c.label}
            href={c.href}
            className="block bg-white rounded-2xl p-5 border border-[#ECEAE4] shadow-card hover:shadow-card-hover transition-shadow duration-200 animate-fade-in-up"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {/* Icon + label + value */}
            <div className="flex items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ background: c.iconBg }}
              >
                <Icon size={21} style={{ color: c.iconColor }} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: '#8A857C' }}>
                  {c.label}
                </p>
                <p className="text-[1.6rem] font-bold leading-tight tabular-nums" style={{ color: '#2D2A26' }}>
                  {c.value}
                </p>
              </div>
            </div>

            {/* Trend row */}
            <div className="mt-3.5 flex items-center gap-1.5">
              {c.trend && (
                <span
                  className="inline-flex items-center gap-0.5 text-xs font-bold"
                  style={{ color: c.trend.positive ? '#9A7A4E' : '#EF4444' }}
                >
                  {c.trend.positive ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />}
                  {c.trend.text}
                </span>
              )}
              {c.sub && (
                <span className="text-xs" style={{ color: '#A39C90' }}>
                  {c.sub}
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
