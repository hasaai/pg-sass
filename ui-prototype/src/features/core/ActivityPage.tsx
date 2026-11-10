/** Activity log: everything people did in the business, newest first, grouped by day. */
import { History } from 'lucide-react'
import { useState } from 'react'

import { FilterChips, NoAccess, PropertyPicker, SearchBox, Toolbar } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { propertyName } from '../../data/selectors'
import { TODAY } from '../../data/seed'
import { useDb } from '../../data/store'
import type { Activity } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatDate } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { KindIcon } from './parts'
import { KIND_LABEL, addDaysISO } from './util'

type Kind = 'all' | Activity['kind']

function dayLabel(day: string) {
  if (day === TODAY) return 'Today'
  if (day === addDaysISO(TODAY, -1)) return 'Yesterday'
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T00:00:00`))
}

export function ActivityLogPage() {
  useBreadcrumbs([{ label: 'Activity log' }])
  const { role } = useSession()
  const db = useDb((d) => d)
  const [kind, setKind] = useState<Kind>('all')
  const [personName, setPersonName] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')

  if (role !== 'owner') return <NoAccess what="the activity log" />

  const people = [...new Set(db.activity.map((a) => a.by))].sort()
  const rows = db.activity.filter((a) => {
    const day = a.at.slice(0, 10)
    return (
      (kind === 'all' || a.kind === kind) &&
      (!personName || a.by === personName) &&
      (!propertyId || a.propertyId === propertyId) &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!q || `${a.action} ${a.target}`.toLowerCase().includes(q.toLowerCase()))
    )
  })
  const groups = new Map<string, Activity[]>()
  for (const a of rows) {
    const day = a.at.slice(0, 10)
    groups.set(day, [...(groups.get(day) ?? []), a])
  }
  const kinds = Object.keys(KIND_LABEL) as Activity['kind'][]
  const filtered = kind !== 'all' || personName || propertyId || from || to || q

  function clear() {
    setKind('all')
    setPersonName('')
    setPropertyId('')
    setFrom('')
    setTo('')
    setQ('')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Activity log" description="Who did what, and when. Kept for 2 years." />
      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search actions or names"
          className="max-w-xs"
        />
        <NativeSelect
          aria-label="Person"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          className="h-9 w-auto min-w-40"
        >
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </NativeSelect>
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From" className="w-40">
          <Input
            type="date"
            value={from}
            max={to || TODAY}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To" className="w-40">
          <Input
            type="date"
            value={to}
            min={from}
            max={TODAY}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="mb-5">
        <FilterChips
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All', count: db.activity.length },
            ...kinds.map((k) => ({
              value: k,
              label: KIND_LABEL[k],
              count: db.activity.filter((a) => a.kind === k).length,
            })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="Nothing matches"
          actions={
            <Button variant="outline" onClick={clear}>
              Clear filters
            </Button>
          }
        >
          Try a wider date range or another person.
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <p className="text-xs text-muted-foreground">{rows.length} entries</p>
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                {dayLabel(day)}{' '}
                <span className="text-xs font-normal text-muted-foreground">{formatDate(day)}</span>
              </h2>
              <ul className="divide-y rounded-xl border bg-card shadow-xs">
                {list.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-3">
                    <KindIcon kind={a.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.by}</span> · {a.action}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.target}
                        {a.propertyId && ` · ${propertyName(db, a.propertyId)}`}
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                      dateTime={a.at}
                    >
                      {a.at.slice(11, 16)}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
