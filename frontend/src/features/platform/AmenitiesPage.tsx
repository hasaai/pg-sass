import { Eye, Filter, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Card, CardHeader } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { EmptyState, ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Input } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { Kpi, TableSkeleton } from './parts'
import type { PlatformAmenity } from './types'

/** Amenity catalog refresh keys: the platform list and the public catalog owners use. */
const CATALOG_QUERIES = ['/platform/amenities/', '/amenities/']

function AmenityRow({ a }: { a: PlatformAmenity }) {
  const types = Array.isArray(a.property_types) ? (a.property_types as string[]) : []
  const [name, setName] = useState(a.name)
  const save = useApiMutation(
    (body: Partial<PlatformAmenity>) =>
      api.patch<PlatformAmenity>(`/platform/amenities/${a.key}/`, body),
    CATALOG_QUERIES,
    () => toast.success('Saved'),
  )
  return (
    <TR className={a.is_active ? undefined : 'bg-secondary/30'}>
      <TD className="max-w-0 min-w-36 sm:max-w-none">
        <Input
          aria-label={`Name of ${a.key}`}
          value={name}
          className="h-8 w-full max-w-72 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input hover:bg-card focus-visible:bg-card"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== a.name && save.mutate({ name: name.trim() })}
        />
        <p className="mt-0.5 truncate px-2 text-xs text-muted-foreground">
          <span className="font-mono text-[11px]">{a.key}</span>
          {types.length ? ` · only for ${types.join(', ')}` : ''}
        </p>
      </TD>
      <TD className="text-center">
        <Checkbox
          aria-label={`${a.name} shown to owners`}
          checked={a.is_active}
          onCheckedChange={(v) => save.mutate({ is_active: v === true })}
        />
      </TD>
      <TD className="text-center">
        <Checkbox
          aria-label={`${a.name} is a search filter`}
          checked={a.is_filterable}
          onCheckedChange={(v) => save.mutate({ is_filterable: v === true })}
        />
      </TD>
    </TR>
  )
}

export function AmenitiesPage() {
  useBreadcrumbs([{ label: 'Amenity catalog' }])
  const list = useApi<PlatformAmenity[]>('/platform/amenities/')
  const all = list.data ?? []
  const groups = new Map<string, PlatformAmenity[]>()
  for (const a of all) groups.set(a.category_name, [...(groups.get(a.category_name) ?? []), a])
  return (
    <>
      <PageHeader
        title="Amenity catalog"
        description="The amenities owners can pick. Switching one off hides it from the picker; properties that already have it keep it."
      />
      <ErrorAlert error={list.error} className="mb-5" />
      {list.isLoading ? (
        <div className="grid gap-5" role="status" aria-label="Loading">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Card className="overflow-hidden">
            <TableSkeleton rows={6} avatar={false} />
          </Card>
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="No amenities yet">
          The catalog is loaded on the server with the sync command.
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Kpi
              label="Amenities"
              value={all.length}
              icon={<Sparkles />}
              hint={`${groups.size} groups`}
            />
            <Kpi
              label="Shown to owners"
              value={all.filter((a) => a.is_active).length}
              icon={<Eye />}
              hint={`${all.filter((a) => !a.is_active).length} switched off`}
            />
            <Kpi
              label="Search filters"
              value={all.filter((a) => a.is_filterable).length}
              icon={<Filter />}
              hint="Used to search listings"
            />
          </div>
          {[...groups].map(([category, items]) => (
            <Card key={category} className="overflow-hidden">
              <CardHeader
                title={category}
                description={`${items.length} amenities`}
                actions={
                  items.some((a) => !a.is_active) && (
                    <Badge tone="neutral">
                      {items.filter((a) => !a.is_active).length} switched off
                    </Badge>
                  )
                }
              />
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH className="w-20 text-center leading-tight whitespace-normal sm:w-36">
                      Shown to owners
                    </TH>
                    <TH className="w-16 text-center leading-tight whitespace-normal sm:w-36">
                      Search filter
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((a) => (
                    <AmenityRow key={a.key} a={a} />
                  ))}
                </TBody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
