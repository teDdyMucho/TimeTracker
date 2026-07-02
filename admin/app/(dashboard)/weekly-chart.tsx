'use client'
import { useEffect, useRef, useState } from 'react'

interface DayData {
  label: string
  date: string
  hours: number
  isToday: boolean
}

export interface UserSeries {
  userId: string
  name: string
  color: string
  days: DayData[]
}

function niceMax(v: number): number {
  if (v === 0) return 8
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const r = v / mag
  return r <= 1 ? mag : r <= 2 ? 2 * mag : r <= 5 ? 5 * mag : 10 * mag
}

function yLabel(hours: number): string {
  if (hours === 0) return '0h'
  const m = Math.round(hours * 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h`
}

function fmtTip(hours: number): string {
  if (hours === 0) return '—'
  const m = Math.round(hours * 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

const Y_TICKS = 5
const INK     = '#2D2A26'
const MUTED   = '#8A857C'
const FAINT   = '#B4AEA3'

export default function WeeklyChart({ series }: { series: UserSeries[] }) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const lineRefs = useRef<(SVGPathElement | null)[]>([])
  const glowRefs = useRef<(SVGPathElement | null)[]>([])

  if (!series.length) return null

  const days     = series[0].days
  const n        = days.length
  const todayIdx = days.findIndex((d) => d.isToday)

  const W   = 600
  const H   = 248
  const pad = { top: 20, right: 18, bottom: 40, left: 46 }
  const cW  = W - pad.left - pad.right
  const cH  = H - pad.top - pad.bottom
  const baseline = pad.top + cH

  const maxRaw = Math.max(...series.flatMap((s) => s.days.map((d) => d.hours)), 0)
  const yMax   = niceMax(maxRaw)
  const ticks  = Array.from({ length: Y_TICKS + 1 }, (_, i) => (yMax / Y_TICKS) * i)

  const xs   = days.map((_, i) => pad.left + (i / (n - 1)) * cW)
  const getY = (h: number) => pad.top + cH - (h / yMax) * cH

  const buildPath = (dd: DayData[]) =>
    dd.reduce((acc, d, i) => {
      const x = xs[i], y = getY(d.hours)
      if (i === 0) return `M ${x},${y}`
      const cx = (xs[i - 1] + x) / 2
      return `${acc} C ${cx},${getY(dd[i - 1].hours)} ${cx},${y} ${x},${y}`
    }, '')

  // Re-key on the actual values so the draw animation replays whenever data changes
  const dataKey = series.map((s) => `${s.userId}:${s.days.map((d) => d.hours).join('-')}`).join('|')

  // ── Draw animation (line + glow draw left → right) ──────────────────────────
  useEffect(() => {
    setReady(false)
    const els = [
      ...lineRefs.current.filter((el): el is SVGPathElement => !!el),
      ...glowRefs.current.filter((el): el is SVGPathElement => !!el),
    ]
    if (!els.length) return
    for (const el of els) {
      const len = el.getTotalLength()
      el.style.transition = 'none'
      el.style.strokeDasharray = `${len}`
      el.style.strokeDashoffset = `${len}`
    }
    void els[0].getBoundingClientRect()
    for (const el of els) {
      el.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      el.style.strokeDashoffset = '0'
    }
    const t = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  // Tooltip geometry
  const vis       = series.slice(0, 5)
  const TIP_W     = 158
  const TIP_ROW_H = 18
  const TIP_H     = 30 + vis.length * TIP_ROW_H + 6
  const tipDayX   = hoveredDay !== null ? xs[hoveredDay] : 0
  const tipX      = Math.min(Math.max(tipDayX - TIP_W / 2, pad.left), pad.left + cW - TIP_W)
  const tipY      = pad.top + 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHoveredDay(null)}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={s.userId} id={`area${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity="0.26" />
            <stop offset="45%"  stopColor={s.color} stopOpacity="0.09" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
        <filter id="lineBlur" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="dotHalo" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="tipShadow" x="-12%" y="-12%" width="124%" height="135%">
          <feDropShadow dx="0" dy="5" stdDeviation="8" floodColor="rgba(43,39,34,0.14)" />
        </filter>
      </defs>

      {/* Grid + Y labels */}
      {ticks.map((t, i) => {
        const y = pad.top + cH - (t / yMax) * cH
        return (
          <g key={i}>
            <line x1={pad.left} y1={y} x2={pad.left + cW} y2={y}
              stroke={i === 0 ? 'rgba(43,39,34,0.10)' : 'rgba(43,39,34,0.045)'} strokeWidth="1" />
            <text x={pad.left - 12} y={y + 4} textAnchor="end" fontSize="11" fill={FAINT}
              fontFamily="system-ui,-apple-system,sans-serif" fontWeight="500">
              {yLabel(t)}
            </text>
          </g>
        )
      })}

      {/* Today highlight column */}
      {todayIdx >= 0 && (
        <>
          <rect x={xs[todayIdx] - 26} y={pad.top - 6} width={52} height={cH + 6} rx="8"
            fill="rgba(111,91,69,0.05)" />
          <line x1={xs[todayIdx]} y1={pad.top - 6} x2={xs[todayIdx]} y2={baseline}
            stroke="rgba(111,91,69,0.18)" strokeWidth="1.5" strokeDasharray="3,4" />
        </>
      )}

      {/* Hover crosshair */}
      {hoveredDay !== null && hoveredDay !== todayIdx && (
        <line x1={xs[hoveredDay]} y1={pad.top} x2={xs[hoveredDay]} y2={baseline}
          stroke={FAINT} strokeWidth="1.5" strokeDasharray="5,4" opacity="0.45" />
      )}

      {/* Area fills */}
      {series.map((s, si) => (
        <path key={s.userId}
          d={`${buildPath(s.days)} L ${xs[n - 1]},${baseline} L ${xs[0]},${baseline} Z`}
          fill={`url(#area${si})`}
          style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.9s ease' }} />
      ))}

      {/* Soft glow under line */}
      {series.map((s, si) => (
        <path key={s.userId}
          ref={(el) => { glowRefs.current[si] = el }}
          d={buildPath(s.days)}
          fill="none" stroke={s.color} strokeWidth="6"
          strokeLinecap="round" strokeLinejoin="round"
          opacity="0.14" filter="url(#lineBlur)" />
      ))}

      {/* Main lines */}
      {series.map((s, si) => (
        <path key={s.userId}
          ref={(el) => { lineRefs.current[si] = el }}
          d={buildPath(s.days)}
          fill="none" stroke={s.color} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      ))}

      {/* Dots */}
      {series.map((s, si) =>
        s.days.map((d, di) => {
          const isHov = hoveredDay === di
          const x = xs[di], y = getY(d.hours)
          return (
            <g key={`${s.userId}-${di}`}
              style={{ opacity: ready ? 1 : 0, transition: `opacity 0.4s ease ${di * 45 + si * 15}ms` }}>
              {isHov && (
                <>
                  <circle cx={x} cy={y} r={14} fill={s.color} fillOpacity="0.10" />
                  <circle cx={x} cy={y} r={8} fill={s.color} fillOpacity="0.22" filter="url(#dotHalo)" />
                  <circle cx={x} cy={y} r={6} fill={s.color} stroke="white" strokeWidth="2.5" />
                </>
              )}
              {!isHov && (
                <circle cx={x} cy={y} r={3.5} fill="white" stroke={s.color} strokeWidth="1.75" />
              )}
            </g>
          )
        })
      )}

      {/* Hit zones + X labels */}
      {days.map((d, di) => {
        const x = xs[di]
        const dayNum = new Date(d.date + 'T00:00:00').getDate()
        return (
          <g key={d.date}>
            <rect x={x - 40} y={0} width={80} height={H} fill="transparent"
              style={{ cursor: 'pointer' }} onMouseEnter={() => setHoveredDay(di)} />
            <text x={x} y={H - 8} textAnchor="middle" fontSize="11.5"
              fontFamily="system-ui,-apple-system,sans-serif"
              fill={d.isToday ? INK : MUTED} fontWeight={d.isToday ? '700' : '500'}>
              {d.label} {dayNum}
            </text>
          </g>
        )
      })}

      {/* Tooltip */}
      {hoveredDay !== null && (
        <g style={{ animation: 'tipIn 0.18s cubic-bezier(0.16,1,0.3,1)', transformBox: 'fill-box', transformOrigin: 'center' }}>
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx="10"
            fill="white" filter="url(#tipShadow)" />
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx="10"
            fill="none" stroke="#ECEAE4" strokeWidth="1" />
          <text x={tipX + 11} y={tipY + 17} fontSize="10.5" fontWeight="800" fill={INK}
            fontFamily="system-ui,-apple-system,sans-serif">
            {new Date(days[hoveredDay].date + 'T00:00:00').toLocaleDateString('en-AU', {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
          </text>
          <line x1={tipX + 11} y1={tipY + 24} x2={tipX + TIP_W - 11} y2={tipY + 24}
            stroke="#ECEAE4" strokeWidth="1" />
          {vis.map((s, si) => {
            const ry = tipY + 30 + si * TIP_ROW_H + TIP_ROW_H / 2
            return (
              <g key={s.userId}>
                <circle cx={tipX + 12} cy={ry} r={3} fill={s.color} />
                <text x={tipX + 21} y={ry + 3.5} fontSize="10" fill={MUTED}
                  fontFamily="system-ui,-apple-system,sans-serif">
                  {s.name.length > 13 ? s.name.slice(0, 12) + '…' : (s.name || 'Total Hours')}
                </text>
                <text x={tipX + TIP_W - 11} y={ry + 3.5} textAnchor="end" fontSize="10.5"
                  fontWeight="800" fill={INK} fontFamily="system-ui,-apple-system,sans-serif">
                  {fmtTip(s.days[hoveredDay].hours)}
                </text>
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}
