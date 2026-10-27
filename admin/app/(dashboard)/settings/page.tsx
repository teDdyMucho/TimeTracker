import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import { normalizePayCycle, periodContaining, lastCompletedPeriod } from '@/lib/pay-cycle'
import { PayCycleForm, LabourAlertForm, AutoPayRunForm } from './settings-forms'
import SecurityCard, { type FactorView } from './security-card'
import { ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface LabourAlertSetting { enabled: boolean; thresholdPct: number; defaultBudget: number | null }

function normalizeLabourAlert(raw: unknown): LabourAlertSetting {
  const c = (raw ?? {}) as Partial<LabourAlertSetting>
  return {
    enabled: c.enabled !== false,
    thresholdPct: typeof c.thresholdPct === 'number' && c.thresholdPct > 0 ? c.thresholdPct : 100,
    defaultBudget: typeof c.defaultBudget === 'number' && c.defaultBudget > 0 ? c.defaultBudget : null,
  }
}

/**
 * Global settings (PRD §20 `settings`): pay cycle, automatic pay run,
 * labour-cost alerts and security. Per-entity overtime / weekend / holiday
 * multipliers and the unpaid-break rule live on each entity (Entities → Pay
 * settings), and public holidays have their own page.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup2fa?: string }>
}) {
  const sp = await searchParams
  const admin = createAdminClient()
  const supabase = await createClient()
  const [{ data: rows }, { data: factorsRes }] = await Promise.all([
    admin.from('settings').select('key, value'),
    supabase.auth.mfa.listFactors(),
  ])
  const byKey = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value]))

  const cycle = normalizePayCycle(byKey.pay_cycle)
  const alert = normalizeLabourAlert(byKey.labour_cost_alert)
  const autoPayRun = (byKey.auto_pay_run as any)?.enabled !== false
  const requireAdmin2fa = (byKey.security as any)?.requireAdmin2fa === true
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const currentPeriod = periodContaining(cycle, today)
  const lastPeriod = lastCompletedPeriod(cycle, today)
  const factors: FactorView[] = (factorsRes?.totp ?? []).map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? null,
    added: new Date(f.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric' }),
  }))

  return (
    <div>
      <PageHeader title="Settings" subtitle="Pay cycle, automation, alerts, security and where to find the other configuration" />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="h-full flex flex-col">
          <h2 className="font-bold text-ink mb-1">Pay cycle</h2>
          <p className="text-xs text-muted mb-5">How often payroll runs. Used for the default pay-run period, the automatic run and the &ldquo;payroll due&rdquo; countdown.</p>
          <PayCycleForm cycle={cycle} currentPeriod={currentPeriod} />
        </Card>

        <Card className="h-full flex flex-col">
          <h2 className="font-bold text-ink mb-1">Automatic pay run</h2>
          <p className="text-xs text-muted mb-5">Draft pay runs are created for you when a period ends. You still review, approve and push to Xero.</p>
          <AutoPayRunForm enabled={autoPayRun} lastPeriod={lastPeriod} />
        </Card>

        <Card className="h-full flex flex-col">
          <h2 className="font-bold text-ink mb-1">Labour cost alerts</h2>
          <p className="text-xs text-muted mb-5">Notify admins when a project&rsquo;s labour cost passes its budget.</p>
          <LabourAlertForm enabled={alert.enabled} thresholdPct={alert.thresholdPct} defaultBudget={alert.defaultBudget} />
        </Card>

        <Card className="h-full flex flex-col">
          <h2 className="font-bold text-ink mb-1">Security</h2>
          <p className="text-xs text-muted mb-5">Two-factor authentication for admin sign-in. Pay rates, payroll and labour costs are only ever readable by admins.</p>
          <SecurityCard factors={factors} requireAdmin2fa={requireAdmin2fa} setupRequested={sp.setup2fa === '1'} />
        </Card>

        <Card className="h-full flex flex-col">
          <h2 className="font-bold text-ink mb-1">Overtime, breaks, weekend and holiday rates</h2>
          <p className="text-xs text-muted mb-4">
            Each entity has its own ladder (ordinary hours, overtime tiers, Saturday / Sunday / public-holiday
            multipliers), its unpaid meal-break rule, and its own &ldquo;overtime must be approved&rdquo; switch.
          </p>
          <Link href="/entities" className="mt-auto self-start text-sm font-semibold inline-flex items-center gap-1" style={{ color: '#1C1A16' }}>
            Edit per entity <ArrowRight size={14} />
          </Link>
        </Card>

        <Card className="h-full flex flex-col">
          <h2 className="font-bold text-ink mb-1">Public holidays</h2>
          <p className="text-xs text-muted mb-4">Dates paid at the public-holiday rate. Victorian holidays are loaded through 2027; add next year&rsquo;s dates before January.</p>
          <Link href="/holidays" className="mt-auto self-start text-sm font-semibold inline-flex items-center gap-1" style={{ color: '#1C1A16' }}>
            Manage holidays <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    </div>
  )
}
