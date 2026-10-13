import Link from 'next/link'
import { createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import { normalizePayCycle, periodContaining } from '@/lib/pay-cycle'
import { PayCycleForm, LabourAlertForm } from './settings-forms'
import { ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface LabourAlertSetting { enabled: boolean; thresholdPct: number }

function normalizeLabourAlert(raw: unknown): LabourAlertSetting {
  const c = (raw ?? {}) as Partial<LabourAlertSetting>
  return {
    enabled: c.enabled !== false,
    thresholdPct: typeof c.thresholdPct === 'number' && c.thresholdPct > 0 ? c.thresholdPct : 100,
  }
}

/**
 * Global settings (PRD §20 `settings`): pay cycle and labour-cost alerts.
 * Per-entity overtime / weekend / holiday multipliers live on each entity
 * (Entities → Edit), and public holidays have their own page.
 */
export default async function SettingsPage() {
  const admin = createAdminClient()
  const { data: rows } = await admin.from('settings').select('key, value')
  const byKey = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value]))

  const cycle = normalizePayCycle(byKey.pay_cycle)
  const alert = normalizeLabourAlert(byKey.labour_cost_alert)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const currentPeriod = periodContaining(cycle, today)

  return (
    <div>
      <PageHeader title="Settings" subtitle="Pay cycle, alerts and where to find the other configuration" />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-bold text-ink mb-1">Pay cycle</h2>
          <p className="text-xs text-muted mb-5">How often payroll runs. Used for the default pay-run period and the &ldquo;payroll due&rdquo; countdown.</p>
          <PayCycleForm cycle={cycle} currentPeriod={currentPeriod} />
        </Card>

        <Card>
          <h2 className="font-bold text-ink mb-1">Labour cost alerts</h2>
          <p className="text-xs text-muted mb-5">Notify admins when a project&rsquo;s labour cost passes its budget.</p>
          <LabourAlertForm enabled={alert.enabled} thresholdPct={alert.thresholdPct} />
        </Card>

        <Card>
          <h2 className="font-bold text-ink mb-1">Overtime, weekend and holiday rates</h2>
          <p className="text-xs text-muted mb-4">
            Each entity has its own ladder (ordinary hours, overtime tiers, Saturday / Sunday / public-holiday
            multipliers) and its own &ldquo;overtime must be approved&rdquo; switch.
          </p>
          <Link href="/entities" className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: '#1C1A16' }}>
            Edit per entity <ArrowRight size={14} />
          </Link>
        </Card>

        <Card>
          <h2 className="font-bold text-ink mb-1">Public holidays</h2>
          <p className="text-xs text-muted mb-4">Dates paid at the public-holiday rate. Add next year&rsquo;s dates before January.</p>
          <Link href="/holidays" className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: '#1C1A16' }}>
            Manage holidays <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    </div>
  )
}
