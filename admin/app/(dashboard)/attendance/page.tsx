import { createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import { CheckCircle2, XCircle } from 'lucide-react'
import AutoRefresh from './auto-refresh'
import PhotoPreview from './photo-preview'
import AttendanceFilter from './attendance-filter'
import { approveAttendanceAction, rejectAttendanceAction } from './actions'

export const dynamic = 'force-dynamic'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function elapsed(since: string) {
  const ms = Date.now() - new Date(since).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDuration(inAt: string, outAt: string): string {
  const ms = new Date(outAt).getTime() - new Date(inAt).getTime()
  const totalMins = Math.round(ms / 60_000)
  if (totalMins < 60) return `${totalMins} min`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'BuildOne-Admin/1.0' }, next: { revalidate: 86400 } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address ?? {}
    const parts = [
      a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
      a.suburb ?? a.neighbourhood,
      a.city ?? a.town ?? a.village,
      a.state,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : (data.display_name ?? null)
  } catch {
    return null
  }
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; employee?: string; entity?: string }>
}) {
  const admin = createAdminClient()
  const params = await searchParams
  // Use the server's local date (matches how work_date is recorded), not a forced timezone.
  const today = new Date().toLocaleDateString('en-CA')
  // Default to TODAY when no param is given. Use ?date=all to see every day.
  // `selection` is what the filter UI reflects ('all' or a specific date);
  // `date` is the actual SQL filter ('' = no filter = all days).
  const selection = params.date ?? today
  const date = selection === 'all' ? '' : selection
  const employeeId = params.employee ?? ''
  const entityId = params.entity ?? ''

  // Dropdown options for the filters (all employees + entities, alphabetical).
  const [empRes, entRes] = await Promise.all([
    admin.from('profiles').select('id, name').eq('status', 'active').neq('role', 'admin').order('name'),
    admin.from('business_entities').select('id, name').eq('status', 'active').order('name'),
  ])
  const employees = (empRes.data ?? []) as { id: string; name: string }[]
  const companies = (entRes.data ?? []) as { id: string; name: string }[]

  let query = admin
    .from('clock_sessions')
    .select(`
      id, work_date, work_location, clocked_in_at, clocked_out_at,
      clock_in_lat, clock_in_lng, clock_in_address, selfie_url, review_status,
      profiles ( name, email ),
      projects ( name ),
      business_entities ( name )
    `)
    .order('clocked_in_at', { ascending: false })
    .limit(200)

  if (date) query = query.eq('work_date', date)
  if (employeeId) query = query.eq('profile_id', employeeId)
  if (entityId) query = query.eq('business_entity_id', entityId)

  const { data: sessions } = await query

  const raw = (sessions ?? []) as any[]

  // Reverse geocode + back-fill missing addresses
  const rows = await Promise.all(
    raw.map(async (s) => {
      if (s.clock_in_address || !s.clock_in_lat || !s.clock_in_lng) return s
      const address = await reverseGeocode(s.clock_in_lat, s.clock_in_lng)
      if (address) {
        await admin.from('clock_sessions').update({ clock_in_address: address }).eq('id', s.id)
      }
      return { ...s, clock_in_address: address }
    }),
  )

  // Active first, then completed by date desc
  const active = rows.filter((r) => !r.clocked_out_at)
  const history = rows.filter((r) => r.clocked_out_at)
  const sorted = [...active, ...history]

  return (
    <div>
      <AutoRefresh intervalSeconds={30} />
      <PageHeader
        title="Attendance"
        subtitle={
          selection === 'all'
            ? `${active.length} currently on the clock · auto-refreshes every 30s`
            : `${sorted.length} session${sorted.length !== 1 ? 's' : ''} on ${formatDate(date)}`
        }
      />

      <AttendanceFilter
        date={selection}
        today={today}
        employees={employees}
        companies={companies}
        employeeId={employeeId}
        entityId={entityId}
      />

      <Card>
        {sorted.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            {date ? `No attendance on ${formatDate(date)}.` : 'No attendance records yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1080px]">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  {[
                    'Photo', 'Employee', 'Company', 'Date',
                    'Project', 'Type', 'Status',
                    'Clock In', 'Clock Out', 'Duration',
                    'Clock-in Address', 'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className={`pb-3 pr-4 text-[10px] font-semibold text-muted uppercase tracking-widest whitespace-nowrap ${h === 'Actions' ? 'text-right' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sorted.map((s) => {
                  const isActive = !s.clocked_out_at
                  const review = (s.review_status ?? 'pending') as 'pending' | 'approved' | 'rejected'
                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${isActive ? 'bg-brand/5 hover:bg-brand/10' : 'hover:bg-slate-50/60'}`}
                    >
                      {/* Photo */}
                      <td className="py-3 pr-3">
                        {s.selfie_url ? (
                          <PhotoPreview src={s.selfie_url} name={s.profiles?.name ?? 'Employee'} />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">
                            {(s.profiles?.name ?? 'E')[0].toUpperCase()}
                          </div>
                        )}
                      </td>

                      {/* Employee */}
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-ink">{s.profiles?.name ?? '—'}</p>
                        <p className="text-muted text-xs">{s.profiles?.email ?? ''}</p>
                      </td>

                      {/* Company */}
                      <td className="py-3 pr-4 text-xs text-muted whitespace-nowrap">
                        {s.business_entities?.name ?? '—'}
                      </td>

                      {/* Date */}
                      <td className="py-3 pr-4 text-muted whitespace-nowrap text-xs">
                        {formatDate(s.work_date)}
                      </td>

                      {/* Project */}
                      <td className="py-3 pr-4 font-medium text-ink">
                        {s.projects?.name ?? '—'}
                      </td>

                      {/* Work type */}
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-muted">
                        {s.work_location === 'site' ? 'Site' : 'Factory'}
                      </td>

                      {/* Status — live timer if active, else the review decision */}
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-brand text-xs font-semibold">
                            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                            {elapsed(s.clocked_in_at)}
                          </span>
                        ) : review === 'approved' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#15803D' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: '#16A34A' }} />
                            Approved
                          </span>
                        ) : review === 'rejected' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#DC2626' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: '#DC2626' }} />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#B45309' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: '#D97706' }} />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Clock In */}
                      <td className="py-3 pr-4 text-muted whitespace-nowrap text-xs">
                        {formatTime(s.clocked_in_at)}
                      </td>

                      {/* Clock Out */}
                      <td className="py-3 pr-4 text-muted whitespace-nowrap text-xs">
                        {s.clocked_out_at ? formatTime(s.clocked_out_at) : (
                          <span className="text-slate-300">&mdash;</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3 pr-4 font-semibold text-ink whitespace-nowrap text-xs">
                        {s.clocked_out_at
                          ? formatDuration(s.clocked_in_at, s.clocked_out_at)
                          : <span className="text-slate-300">&mdash;</span>}
                      </td>

                      {/* Address — clicking opens Google Maps */}
                      <td className="py-3 max-w-[200px]">
                        {s.clock_in_lat && s.clock_in_lng ? (
                          <a
                            href={`https://maps.google.com/?q=${s.clock_in_lat},${s.clock_in_lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-brand hover:underline underline-offset-2 leading-tight block"
                          >
                            {s.clock_in_address ?? `${s.clock_in_lat}, ${s.clock_in_lng}`}
                          </a>
                        ) : s.clock_in_address ? (
                          <span className="text-xs text-muted leading-tight block">{s.clock_in_address}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">&mdash;</span>
                        )}
                      </td>

                      {/* Actions — accept/reject the attendance after checking photo + location */}
                      <td className="py-3">
                        <div className="flex gap-1.5 items-center justify-end flex-nowrap">
                          {isActive ? (
                            <span className="text-slate-300 text-xs">On the clock</span>
                          ) : review === 'pending' ? (
                            <>
                              <form action={approveAttendanceAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <button
                                  type="submit"
                                  className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-semibold text-white transition-colors whitespace-nowrap"
                                  style={{ background: '#1C1A16' }}
                                >
                                  <CheckCircle2 size={13} /> Approve
                                </button>
                              </form>
                              <form action={rejectAttendanceAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <button
                                  type="submit"
                                  className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors whitespace-nowrap"
                                >
                                  <XCircle size={13} /> Reject
                                </button>
                              </form>
                            </>
                          ) : (
                            // Already decided — allow flipping the decision
                            <form action={review === 'approved' ? rejectAttendanceAction : approveAttendanceAction}>
                              <input type="hidden" name="id" value={s.id} />
                              <button
                                type="submit"
                                className="inline-flex items-center h-7 px-3 rounded-lg text-xs font-medium border text-muted hover:bg-slate-50 transition-colors whitespace-nowrap"
                                style={{ borderColor: '#ECEAE4' }}
                              >
                                {review === 'approved' ? 'Reject instead' : 'Approve instead'}
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
