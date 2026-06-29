'use client'
import Link from 'next/link'

interface Segment {
  label: string
  count: number
  color: string
}

const R    = 58
const SW   = 20
const CX   = 80
const CY   = 80
const CIRC = 2 * Math.PI * R

function DonutRing({ segments, total }: { segments: Segment[]; total: number }) {
  let cum = 0
  return (
    <svg viewBox="0 0 160 160" className="w-full">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F2F0EA" strokeWidth={SW} />
      {total > 0 && segments.map((seg, i) => {
        if (seg.count === 0) return null
        const f = seg.count / total
        const dash = Math.max(0, f * CIRC - 3)
        const rot = cum - 90
        cum += f * 360
        return (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={seg.color} strokeWidth={SW}
            strokeDasharray={`${dash} ${CIRC}`}
            transform={`rotate(${rot}, ${CX}, ${CY})`} />
        )
      })}
      <text x={CX} y={CY - 5} textAnchor="middle" fontSize="26" fontWeight="800" fill="#2D2A26"
        fontFamily="system-ui,-apple-system,sans-serif">
        {total}
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize="10" fontWeight="500" fill="#B4AEA3"
        fontFamily="system-ui,-apple-system,sans-serif">
        Total
      </text>
    </svg>
  )
}

interface Props {
  statusCounts: { submitted: number; approved: number; locked: number }
}

export default function TeamDonut({ statusCounts }: Props) {
  const segments: Segment[] = [
    { label: 'Approved',  count: statusCounts.approved,  color: '#1C1A16' },
    { label: 'Submitted', count: statusCounts.submitted, color: '#A1A1AA' },
    { label: 'Locked',    count: statusCounts.locked,    color: '#3F3F46' },
  ]
  const total = segments.reduce((s, seg) => s + seg.count, 0)

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#1C1A16] shadow-card h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-base" style={{ color: '#2D2A26' }}>Team Activity</h2>
        <Link href="/attendance" className="text-xs font-bold" style={{ color: '#1C1A16' }}>
          View all
        </Link>
      </div>

      <div className="flex items-center gap-5 flex-1">
        {/* Donut */}
        <div className="w-36 shrink-0 animate-scale-in" key={segments.map((s) => s.count).join('-')}>
          <DonutRing segments={segments} total={total} />
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3.5">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-sm flex-1" style={{ color: '#6B6660' }}>{s.label}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#2D2A26' }}>{s.count}</span>
              <span className="text-xs font-medium tabular-nums w-10 text-right" style={{ color: '#B4AEA3' }}>
                {total > 0 ? `${Math.round((s.count / total) * 100)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
