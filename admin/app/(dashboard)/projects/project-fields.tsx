'use client'
import { Input } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import type { BusinessEntity } from '@/lib/types'

export interface ProjectFormValues {
  name?: string
  client?: string | null
  code?: string | null
  business_entity_id?: string
  budget_hours?: number | null
  budget_labour_cost?: number | null
  start_date?: string | null
  end_date?: string | null
}

/**
 * The project form body shared by New Project and Edit Project (PRD §13):
 * name, client, code, entity, hour and labour-cost budgets, start/end dates.
 */
export default function ProjectFields({
  values,
  entities,
  entityId,
  onEntityChange,
  pending,
}: {
  values: ProjectFormValues
  entities: BusinessEntity[]
  entityId: string
  onEntityChange: (v: string) => void
  pending: boolean
}) {
  return (
    <>
      <Input label="Project name" name="name" required placeholder="Brisbane Renovation" defaultValue={values.name ?? ''} disabled={pending} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Client / builder" name="client" placeholder="Optional" defaultValue={values.client ?? ''} disabled={pending} />
        <Input label="Code" name="code" placeholder="Optional" defaultValue={values.code ?? ''} disabled={pending} />
      </div>
      <div>
        <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Business entity</span>
        <Dropdown
          name="business_entity_id"
          value={entityId}
          onChange={onEntityChange}
          options={entities.map((e) => ({ value: e.id, label: e.name }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Budget hours" name="budget_hours" type="number" step="0.5" min="0" placeholder="e.g. 400" defaultValue={values.budget_hours != null ? String(values.budget_hours) : ''} disabled={pending} />
        <Input label="Budget labour cost ($)" name="budget_labour_cost" type="number" step="0.01" min="0" placeholder="e.g. 25000" defaultValue={values.budget_labour_cost != null ? String(values.budget_labour_cost) : ''} disabled={pending} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start date" name="start_date" type="date" defaultValue={values.start_date ?? ''} disabled={pending} />
        <Input label="End date" name="end_date" type="date" defaultValue={values.end_date ?? ''} disabled={pending} />
      </div>
    </>
  )
}
