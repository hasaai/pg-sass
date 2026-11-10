/**
 * Supporting view: availability and maintenance per floor, and bulk changes to many rooms at
 * once (rent, maintenance blocking, AC / attached bathroom), always previewed and confirmed.
 */
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Eye, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'

import { api } from '../../../../api/client'
import type { Room } from '../../../../api/types'
import { Badge } from '../../../../components/ui-kit/badge'
import { Button } from '../../../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../../../components/ui-kit/card'
import { Checkbox } from '../../../../components/ui-kit/checkbox'
import { Segmented } from '../../../../components/ui-kit/choice-cards'
import { ConfirmDialog } from '../../../../components/ui-kit/confirm'
import { Alert } from '../../../../components/ui-kit/feedback'
import { Field } from '../../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../../../components/ui-kit/table'
import { toast } from '../../../../components/ui-kit/toast'
import { cn } from '../../../../lib/cn'
import { formatMoney, plural, rupeesToPaise } from '../../../../lib/format'
import { PROPERTY_QUERIES } from '../../api'
import { StateBar } from '../roomParts'
import { useBedStatus } from '../useBedStatus'
import { countRooms, maintenancePlan, rentPreview } from '../roomStats'
import type { FloorSummary, RentRule, StayIndex } from '../roomStats'

type Action = 'rent' | 'maintenance' | 'details'
type RentMode = 'set' | 'add' | 'percent'
type Toggle = 'keep' | 'yes' | 'no'

interface Step {
  label: string
  path: string
  body: Record<string, unknown>
}

function MarkAvailable({ bed }: { bed: Room['beds'][number] }) {
  const setStatus = useBedStatus(bed)
  return (
    <Button size="sm" variant="outline" onClick={() => setStatus('vacant')}>
      Mark available
    </Button>
  )
}

/** "+₹500" / "₹9,000" / "+5%" written into a rule, or an error in plain words. */
function readRule(mode: RentMode, value: string): RentRule | string {
  const v = value.trim()
  if (!v) return 'Enter an amount.'
  if (mode === 'percent') {
    const n = Number(v.replace('%', ''))
    if (!Number.isFinite(n) || n === 0 || n < -50 || n > 100)
      return 'Enter a percentage between −50 and 100, e.g. 5 or -10.'
    return { kind: 'percent', percent: n }
  }
  const negative = v.startsWith('-')
  const paise = rupeesToPaise(v.replace(/^[-+]/, ''))
  if (paise === null) return 'Enter an amount in rupees, e.g. 500.'
  if (mode === 'set') {
    if (negative || paise === 0) return 'The new rent must be more than ₹0.'
    return { kind: 'set', amount: paise }
  }
  if (paise === 0) return 'Enter an amount other than ₹0.'
  return { kind: 'add', amount: negative ? -paise : paise }
}

export function MaintenanceView({
  summaries,
  rooms,
  stays,
  canManage,
  showMoney,
}: {
  summaries: FloorSummary[]
  rooms: Room[]
  stays?: StayIndex
  canManage: boolean
  showMoney: boolean
}) {
  const queryClient = useQueryClient()
  const withRooms = summaries.filter((s) => s.rooms.length > 0)
  const total = countRooms(rooms, stays)
  const blockedBeds = rooms.flatMap((r) =>
    r.beds.filter((b) => b.status === 'blocked').map((b) => ({ bed: b, room: r })),
  )

  // ------------------------------------------------ bulk selection + action
  const [floorKey, setFloorKey] = useState('')
  const [sharing, setSharing] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<Action>(showMoney ? 'rent' : 'maintenance')
  const [rentMode, setRentMode] = useState<RentMode>('add')
  const [rentValue, setRentValue] = useState('')
  const [block, setBlock] = useState<'block' | 'free'>('block')
  const [ac, setAc] = useState<Toggle>('keep')
  const [bath, setBath] = useState<Toggle>('keep')
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [failures, setFailures] = useState<string[]>([])

  const candidates = withRooms
    .filter((s) => !floorKey || s.key === floorKey)
    .flatMap((s) => s.rooms.map((r) => ({ room: r, floor: s.title })))
    .filter(({ room }) => !sharing || String(room.sharing) === sharing)
  const selected = rooms.filter((r) => picked.has(r.id))
  const allPicked = candidates.length > 0 && candidates.every((c) => picked.has(c.room.id))
  const sharings = [...new Set(rooms.map((r) => r.sharing))].sort((a, b) => a - b)

  const rule = action === 'rent' ? readRule(rentMode, rentValue) : null
  const ruleError = typeof rule === 'string' ? rule : null

  const plan = useMemo((): {
    steps: Step[]
    rows: [string, string, string, string][]
    notes: string[]
  } => {
    const notes: string[] = []
    if (action === 'rent' && rule && typeof rule !== 'string') {
      const changes = rentPreview(selected, rule, stays).filter((c) => c.to !== c.from)
      const occupied = changes.filter((c) => c.occupied).length
      if (occupied)
        notes.push(
          `${plural(occupied, 'place')} ${occupied === 1 ? 'has' : 'have'} a tenant: their agreed rent stays as it is. New tenants pay the new rent.`,
        )
      return {
        steps: changes.map((c) => ({
          label: c.label,
          path: c.bedId ? `/beds/${c.bedId}/` : `/rooms/${c.roomId}/`,
          body: { monthly_rent: c.to },
        })),
        rows: changes.map((c) => [
          c.label,
          formatMoney(c.from),
          formatMoney(c.to),
          c.occupied ? 'Tenant keeps agreed rent' : '',
        ]),
        notes,
      }
    }
    if (action === 'maintenance') {
      const p = maintenancePlan(selected, block === 'block')
      if (p.skippedOccupied.length)
        notes.push(
          `${plural(p.skippedOccupied.length, 'occupied bed')} ${p.skippedOccupied.length === 1 ? 'is' : 'are'} left as ${p.skippedOccupied.length === 1 ? 'it is' : 'they are'}: a bed with a tenant changes only when they check out.`,
        )
      if (p.unchanged)
        notes.push(
          `${plural(p.unchanged, 'bed')} already ${block === 'block' ? 'under maintenance' : 'available'}.`,
        )
      return {
        steps: p.change.map(({ bed, room }) => ({
          label: `Room ${room.number} · Bed ${bed.label}`,
          path: `/beds/${bed.id}/`,
          body: { status: block === 'block' ? 'blocked' : 'vacant' },
        })),
        rows: p.change.map(({ bed, room }) => [
          `Room ${room.number} · Bed ${bed.label}`,
          bed.status_label,
          block === 'block' ? 'Under maintenance' : 'Vacant',
          '',
        ]),
        notes,
      }
    }
    if (action === 'details') {
      const steps: Step[] = []
      const rows: [string, string, string, string][] = []
      for (const r of selected) {
        const body: Record<string, unknown> = {}
        const before: string[] = []
        const after: string[] = []
        if (ac !== 'keep' && r.is_ac !== (ac === 'yes')) {
          body.is_ac = ac === 'yes'
          before.push(r.is_ac ? 'AC' : 'No AC')
          after.push(ac === 'yes' ? 'AC' : 'No AC')
        }
        if (bath !== 'keep' && r.has_attached_bath !== (bath === 'yes')) {
          body.has_attached_bath = bath === 'yes'
          before.push(r.has_attached_bath ? 'Attached bath' : 'Shared bath')
          after.push(bath === 'yes' ? 'Attached bath' : 'Shared bath')
        }
        if (Object.keys(body).length) {
          steps.push({ label: `Room ${r.number}`, path: `/rooms/${r.id}/`, body })
          rows.push([`Room ${r.number}`, before.join(', '), after.join(', '), ''])
        }
      }
      return { steps, rows, notes }
    }
    return { steps: [], rows: [], notes }
  }, [action, rule, selected, stays, block, ac, bath])

  function pick(id: string, on: boolean) {
    setPicked((p) => {
      const n = new Set(p)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
    setPreviewing(false)
  }

  async function apply() {
    setRunning({ done: 0, total: plan.steps.length })
    const failed: string[] = []
    for (const [i, s] of plan.steps.entries()) {
      try {
        await api.patch(s.path, s.body)
      } catch (e) {
        failed.push(`${s.label}: ${e instanceof Error ? e.message : 'not saved'}`)
      }
      setRunning({ done: i + 1, total: plan.steps.length })
    }
    await queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === 'string' &&
        PROPERTY_QUERIES.some((p) => String(q.queryKey[0]).startsWith(p)),
    })
    setRunning(null)
    setConfirming(false)
    setPreviewing(false)
    setFailures(failed)
    const ok = plan.steps.length - failed.length
    if (ok) toast.success(`${plural(ok, 'change')} saved`)
    if (failed.length) toast.error(`${plural(failed.length, 'change')} could not be saved`)
  }

  const toggle = (value: Toggle, set: (v: Toggle) => void, label: string) => (
    <Segmented<Toggle>
      label={label}
      value={value}
      onChange={(v) => {
        set(v)
        setPreviewing(false)
      }}
      options={[
        { value: 'keep', label: 'No change' },
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ]}
    />
  )

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Availability by floor"
            description="Beds under maintenance are not counted as available."
          />
          <div className="overflow-hidden border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Floor</TH>
                  <TH className="text-right">Rentable</TH>
                  <TH className="text-right">Occupied</TH>
                  <TH className="text-right">Vacant</TH>
                  <TH className="text-right">Maintenance</TH>
                  <TH className="w-40">Available</TH>
                </TR>
              </THead>
              <TBody>
                {[...withRooms, { key: 'total', title: 'Whole building', counts: total }].map(
                  (s) => (
                    <TR
                      key={s.key}
                      className={cn(s.key === 'total' && 'bg-secondary/40 font-semibold')}
                    >
                      <TD className="font-medium">{s.title}</TD>
                      <TD className="text-right">{s.counts.sellable}</TD>
                      <TD className="text-right text-sky-700">
                        {s.counts.occupied + s.counts.notice}
                      </TD>
                      <TD className="text-right text-emerald-700">{s.counts.vacant}</TD>
                      <TD className="text-right">{s.counts.blocked}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <StateBar counts={s.counts} className="flex-1" />
                          <span className="w-9 text-right text-xs tabular-nums">
                            {s.counts.availablePct}%
                          </span>
                        </div>
                      </TD>
                    </TR>
                  ),
                )}
              </TBody>
            </Table>
          </div>
          {showMoney && (
            <CardContent className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <div className="rounded-lg bg-emerald-50/70 px-3 py-2.5">
                <p className="text-xs text-emerald-800">Vacant beds could bring</p>
                <p className="mt-0.5 text-[17px] font-semibold text-emerald-900 tabular-nums">
                  {formatMoney(total.vacantRent)} a month
                </p>
              </div>
              <div className="rounded-lg bg-secondary/70 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">Rent lost to maintenance</p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums">
                  {formatMoney(total.blockedRent)} a month
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Under maintenance"
            description={
              blockedBeds.length
                ? `${plural(blockedBeds.length, 'bed')} can’t take a tenant right now`
                : 'Every bed can be rented'
            }
          />
          <CardContent>
            {blockedBeds.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-[13px] text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-600" /> No beds are blocked for
                repairs.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {blockedBeds.map(({ bed, room }) => (
                  <li key={bed.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-[13.5px]">
                      <Wrench className="size-3.5 text-muted-foreground" />
                      Room {room.number} · Bed {bed.label}
                      {room.floor_label && (
                        <span className="text-xs text-muted-foreground">· {room.floor_label}</span>
                      )}
                    </span>
                    {canManage && <MarkAvailable bed={bed} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <Card>
          <CardHeader
            title="Bulk changes"
            description="Pick rooms, choose what to change, check the preview, then confirm."
          />
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section aria-label="Rooms to change" className="grid content-start gap-3">
              <p className="text-[13px] font-semibold">1. Rooms</p>
              <div className="flex flex-wrap gap-2">
                <NativeSelect
                  aria-label="Floor to pick from"
                  className="w-auto min-w-36"
                  value={floorKey}
                  onChange={(e) => setFloorKey(e.target.value)}
                >
                  <option value="">All floors</option>
                  {withRooms.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Sharing to pick from"
                  className="w-auto min-w-32"
                  value={sharing}
                  onChange={(e) => setSharing(e.target.value)}
                >
                  <option value="">Any sharing</option>
                  {sharings.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'Single' : `${n} sharing`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border">
                <label className="sticky top-0 z-10 flex items-center gap-2.5 border-b bg-secondary/80 px-3 py-2 text-xs font-medium backdrop-blur">
                  <Checkbox
                    checked={allPicked}
                    onCheckedChange={(v) => {
                      setPicked((p) => {
                        const n = new Set(p)
                        for (const c of candidates) {
                          if (v) n.add(c.room.id)
                          else n.delete(c.room.id)
                        }
                        return n
                      })
                      setPreviewing(false)
                    }}
                    aria-label="Pick all rooms shown"
                  />
                  Pick all shown ({candidates.length})
                  <span className="ml-auto text-muted-foreground">{picked.size} picked</span>
                </label>
                <ul className="divide-y">
                  {candidates.map(({ room, floor }) => {
                    const c = countRooms([room], stays)
                    return (
                      <li key={room.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-secondary/40">
                          <Checkbox
                            checked={picked.has(room.id)}
                            onCheckedChange={(v) => pick(room.id, v === true)}
                            aria-label={`Pick room ${room.number}`}
                          />
                          <span className="font-medium">Room {room.number}</span>
                          <span className="text-xs text-muted-foreground">
                            {floor} · {room.sharing === 1 ? 'Single' : `${room.sharing} sharing`}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                            {room.letting === 'whole'
                              ? 'Whole room'
                              : `${c.occupied + c.notice}/${c.beds} occupied`}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>

            <section aria-label="What to change" className="grid content-start gap-4">
              <p className="text-[13px] font-semibold">2. Change</p>
              <Segmented<Action>
                label="What to change"
                value={action}
                onChange={(v) => {
                  setAction(v)
                  setPreviewing(false)
                }}
                options={[
                  ...(showMoney ? [{ value: 'rent' as const, label: 'Rent' }] : []),
                  { value: 'maintenance', label: 'Maintenance' },
                  { value: 'details', label: 'Room details' },
                ]}
              />
              {action === 'rent' && (
                <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
                  <Field label="How">
                    <NativeSelect
                      value={rentMode}
                      onChange={(e) => {
                        setRentMode(e.target.value as RentMode)
                        setPreviewing(false)
                      }}
                    >
                      <option value="add">Raise or lower by ₹</option>
                      <option value="percent">Raise or lower by %</option>
                      <option value="set">Set rent to ₹</option>
                    </NativeSelect>
                  </Field>
                  <Field
                    label={rentMode === 'percent' ? 'Percent' : 'Amount (₹ a month)'}
                    hint={
                      rentMode === 'set'
                        ? 'For each bed, or each whole room.'
                        : 'Use a minus sign to lower, e.g. -500.'
                    }
                    error={rentValue && ruleError ? ruleError : undefined}
                  >
                    <Input
                      inputMode="decimal"
                      placeholder={rentMode === 'percent' ? '5' : '500'}
                      value={rentValue}
                      onChange={(e) => {
                        setRentValue(e.target.value)
                        setPreviewing(false)
                      }}
                    />
                  </Field>
                </div>
              )}
              {action === 'maintenance' && (
                <Segmented<'block' | 'free'>
                  label="Maintenance"
                  value={block}
                  onChange={(v) => {
                    setBlock(v)
                    setPreviewing(false)
                  }}
                  options={[
                    { value: 'block', label: 'Block free beds for maintenance' },
                    { value: 'free', label: 'Maintenance done: make available' },
                  ]}
                />
              )}
              {action === 'details' && (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">Air-conditioned</span>
                    {toggle(ac, setAc, 'Air-conditioned')}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">Attached bathroom</span>
                    {toggle(bath, setBath, 'Attached bathroom')}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  disabled={selected.length === 0 || Boolean(ruleError)}
                  onClick={() => setPreviewing(true)}
                >
                  <Eye /> Preview changes
                </Button>
                {selected.length === 0 && (
                  <span className="text-xs text-muted-foreground">Pick at least one room.</span>
                )}
              </div>
            </section>
          </CardContent>

          {previewing && (
            <div className="border-t" aria-label="Preview">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <p className="text-[14px] font-semibold">
                  3. Preview: {plural(plan.steps.length, 'change')}
                </p>
                <Button disabled={plan.steps.length === 0} onClick={() => setConfirming(true)}>
                  Apply {plural(plan.steps.length, 'change')} <ArrowRight />
                </Button>
              </div>
              {plan.notes.map((n) => (
                <Alert key={n} tone="info" className="mx-5 mb-3">
                  {n}
                </Alert>
              ))}
              {plan.rows.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-muted-foreground">
                  Nothing would change for the rooms you picked.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto border-t">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Place</TH>
                        <TH>Now</TH>
                        <TH>After</TH>
                        <TH>Note</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {plan.rows.map(([place, from, to, note]) => (
                        <TR key={place}>
                          <TD className="font-medium">{place}</TD>
                          <TD className="text-muted-foreground">{from}</TD>
                          <TD className="font-semibold">{to}</TD>
                          <TD>{note && <Badge tone="info">{note}</Badge>}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          {failures.length > 0 && (
            <Alert tone="bad" title="Some changes were not saved" className="m-5">
              <ul className="list-disc pl-4">
                {failures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Alert>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !running && setConfirming(o)}
        title={`Apply ${plural(plan.steps.length, 'change')}?`}
        confirmLabel={running ? `Saving ${running.done} of ${running.total}…` : 'Yes, apply'}
        busy={Boolean(running)}
        onConfirm={() => void apply()}
      >
        <p>
          {action === 'rent'
            ? 'The new rent is used for new tenants and new bills from now on. Tenants already staying keep their agreed rent.'
            : action === 'maintenance'
              ? block === 'block'
                ? 'These beds will not be available to rent until you mark them available again.'
                : 'These beds will be available to rent again.'
              : 'The room details are updated straight away.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}
