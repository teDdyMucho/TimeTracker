'use client'
import { useState, type ReactNode } from 'react'
import { ListChecks, FolderKanban } from 'lucide-react'

type Tab = 'runs' | 'perProject'

/**
 * Two-tab switcher for the payroll page: "Pay runs" (PDF export + the pay-run
 * list) and "Payroll per project". Both panels are server-rendered and passed
 * in as props; we keep them mounted and just toggle visibility so switching
 * tabs is instant (no refetch).
 */
export default function PayrollTabs({
  runsPanel,
  perProjectPanel,
}: {
  runsPanel: ReactNode
  perProjectPanel: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('runs')

  const base = 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 hover:opacity-90'
  const activeStyle = { background: '#1C1A16', color: '#fff', borderColor: '#1C1A16' }
  const idleStyle = { background: '#fff', color: '#76716A', borderColor: '#ECEAE4' }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('runs')}
          className={`${base} border`}
          style={tab === 'runs' ? activeStyle : idleStyle}
        >
          <ListChecks size={15} /> Pay runs
        </button>
        <button
          type="button"
          onClick={() => setTab('perProject')}
          className={`${base} border`}
          style={tab === 'perProject' ? activeStyle : idleStyle}
        >
          <FolderKanban size={15} /> Payroll per project
        </button>
      </div>

      <div className={tab === 'runs' ? '' : 'hidden'}>{runsPanel}</div>
      <div className={tab === 'perProject' ? '' : 'hidden'}>{perProjectPanel}</div>
    </div>
  )
}
