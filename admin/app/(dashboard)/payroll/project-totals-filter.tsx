'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Dropdown from '@/components/dropdown'

interface Entity { id: string; name: string }
interface Project { id: string; name: string; business_entity_id: string }

/**
 * Filter for the "Payroll per project" breakdown. Writes its scope to the URL
 * (ppEntity / ppFrom / ppTo / ppProject) so the server component recomputes the
 * totals. Entity is chosen first; the project list filters to that entity.
 */
export default function ProjectTotalsFilter({
  entities,
  projects,
  entityId,
  projectId,
  from,
  to,
}: {
  entities: Entity[]
  projects: Project[]
  entityId: string
  projectId: string
  from: string
  to: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // Changing entity clears a project that no longer belongs to it.
  function onEntityChange(id: string) {
    const keepProject =
      projectId && projects.find((p) => p.id === projectId)?.business_entity_id === id
        ? projectId
        : ''
    setParams({ ppEntity: id, ppProject: keepProject })
  }

  const entityProjects = entityId
    ? projects.filter((p) => p.business_entity_id === entityId)
    : projects

  const dateCls =
    'border border-line rounded-xl px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all'
  const labelCls = 'text-[10px] font-semibold text-muted uppercase tracking-widest'

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 bg-white rounded-2xl border border-line px-5 py-4 shadow-card">
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Entity</label>
        <Dropdown
          value={entityId}
          onChange={onEntityChange}
          buttonClassName="min-w-[160px]"
          options={[{ value: '', label: 'All entities' }, ...entities.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Project</label>
        <Dropdown
          value={projectId}
          onChange={(v) => setParams({ ppProject: v })}
          buttonClassName="min-w-[200px]"
          options={[{ value: '', label: 'All projects' }, ...entityProjects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>From</label>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setParams({ ppFrom: e.target.value })}
          className={dateCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>To</label>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setParams({ ppTo: e.target.value })}
          className={dateCls}
        />
      </div>

      {(entityId || projectId) && (
        <button
          type="button"
          onClick={() => setParams({ ppEntity: '', ppProject: '' })}
          className="px-3.5 py-2 rounded-xl text-sm font-medium text-muted hover:text-ink hover:bg-stone transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}
