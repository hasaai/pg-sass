/**
 * Pure helpers for Rooms & beds: one set of counts, one set of status words and colours,
 * shared by the floor layout, room table, bed allocation and maintenance views.
 */
import type { Floor, Room, Stay } from '../../../api/types'
import { floorName } from '../labels'

type Bed = Room['beds'][number]

/** What a bed shows: the server status, plus "Leaving soon" when its tenant gave notice. */
export type BedState = 'vacant' | 'occupied' | 'notice' | 'reserved' | 'blocked'

export const BED_STATE: Record<
  BedState,
  { label: string; tone: 'good' | 'info' | 'warn' | 'neutral' | 'bad'; dot: string; tile: string }
> = {
  vacant: {
    label: 'Vacant',
    tone: 'good',
    dot: 'bg-emerald-500',
    tile: 'border-emerald-600/20 bg-emerald-50 text-emerald-800',
  },
  occupied: {
    label: 'Occupied',
    tone: 'info',
    dot: 'bg-sky-600',
    tile: 'border-sky-600/20 bg-sky-50 text-sky-900',
  },
  notice: {
    label: 'Leaving soon',
    tone: 'warn',
    dot: 'bg-orange-500',
    tile: 'border-orange-500/25 bg-orange-50 text-orange-900',
  },
  reserved: {
    label: 'Reserved',
    tone: 'warn',
    dot: 'bg-amber-400',
    tile: 'border-amber-500/25 bg-amber-50 text-amber-900',
  },
  blocked: {
    label: 'Under maintenance',
    tone: 'neutral',
    dot: 'bg-slate-400',
    tile: 'border-slate-300 bg-[repeating-linear-gradient(135deg,var(--color-secondary)_0_6px,oklch(0.985_0.003_220)_6px_12px)] text-slate-700',
  },
}

export const BED_STATE_ORDER: BedState[] = ['occupied', 'notice', 'vacant', 'reserved', 'blocked']

/** Stays by the place they rent, so a bed or a whole room can show its tenant. */
export interface StayIndex {
  byBed: Map<string, Stay>
  byRoom: Map<string, Stay>
}

export function indexStays(stays: Stay[]): StayIndex {
  const byBed = new Map<string, Stay>()
  const byRoom = new Map<string, Stay>()
  for (const s of stays) {
    if (s.status === 'closed') continue
    if (s.place.bed_id) byBed.set(s.place.bed_id, s)
    else if (s.place.room_id) byRoom.set(s.place.room_id, s)
  }
  return { byBed, byRoom }
}

export function bedState(bed: Bed, stays?: StayIndex): BedState {
  if (bed.status === 'occupied') {
    return stays?.byBed.get(bed.id)?.status === 'notice' ? 'notice' : 'occupied'
  }
  return bed.status as BedState
}

export interface Counts {
  rooms: number
  beds: number
  occupied: number
  notice: number
  vacant: number
  reserved: number
  blocked: number
  /** Beds that can be rented at all (not under maintenance). */
  sellable: number
  /** Occupied (incl. leaving soon) as a % of sellable beds. */
  occupancyPct: number
  /** Vacant beds as a % of sellable beds. */
  availablePct: number
  /** Monthly rent the vacant beds would bring (paise). */
  vacantRent: number
  /** Rent lost each month on beds under maintenance (paise). */
  blockedRent: number
}

export function countRooms(rooms: Room[], stays?: StayIndex): Counts {
  const c: Counts = {
    rooms: rooms.length,
    beds: 0,
    occupied: 0,
    notice: 0,
    vacant: 0,
    reserved: 0,
    blocked: 0,
    sellable: 0,
    occupancyPct: 0,
    availablePct: 0,
    vacantRent: 0,
    blockedRent: 0,
  }
  for (const r of rooms) {
    for (const b of r.beds) {
      c.beds += 1
      const s = bedState(b, stays)
      c[s] += 1
      if (s === 'vacant') c.vacantRent += b.monthly_rent
      if (s === 'blocked') c.blockedRent += b.monthly_rent
    }
  }
  c.sellable = c.beds - c.blocked
  c.occupancyPct = c.sellable ? Math.round(((c.occupied + c.notice) / c.sellable) * 100) : 0
  c.availablePct = c.sellable ? Math.round((c.vacant / c.sellable) * 100) : 0
  return c
}

export interface FloorSummary {
  /** Floor id, or `n<number>` for a floor the building has but no rooms are on yet, or 'none'. */
  key: string
  number: number | null
  title: string
  floorId: string | null
  rooms: Room[]
  counts: Counts
}

const byNumber = (a: Room, b: Room) =>
  a.number.localeCompare(b.number, undefined, { numeric: true })

/**
 * Every floor of the building, top floor first: floors with rooms, and the empty floors up to
 * the building's number of floors (so a five-floor building always shows five floors).
 */
export function floorSummaries(
  rooms: Room[],
  floors: Floor[],
  totalFloors: number | null | undefined,
  stays?: StayIndex,
): FloorSummary[] {
  const known = new Map(floors.map((f) => [f.number, f]))
  const numbers = new Set<number>(floors.map((f) => f.number))
  // Same numbering as the floor picker: a 5-floor building is the ground floor + floors 1–4.
  if (totalFloors && totalFloors > 0)
    for (let n = 0; n < Math.min(totalFloors, 60); n++) numbers.add(n)
  const out: FloorSummary[] = [...numbers]
    .sort((a, b) => b - a)
    .map((n) => {
      const floor = known.get(n)
      const list = floor ? rooms.filter((r) => r.floor === floor.id).sort(byNumber) : []
      return {
        key: floor?.id ?? `n${n}`,
        number: n,
        title: floor?.display_name ?? floorName(n),
        floorId: floor?.id ?? null,
        rooms: list,
        counts: countRooms(list, stays),
      }
    })
  const loose = rooms.filter((r) => !r.floor).sort(byNumber)
  if (loose.length)
    out.push({
      key: 'none',
      number: null,
      title: 'No floor set',
      floorId: null,
      rooms: loose,
      counts: countRooms(loose, stays),
    })
  return out
}

/* ---------------------------------------------------------------- bulk rent */

export type RentRule =
  | { kind: 'set'; amount: number } // paise
  | { kind: 'add'; amount: number } // paise, may be negative
  | { kind: 'percent'; percent: number } // e.g. 5 = +5 %, -10 = −10 %

export interface RentChange {
  roomId: string
  roomNumber: string
  /** A bed id, or null for a room rented as a whole. */
  bedId: string | null
  label: string
  from: number
  to: number
  /** A tenant lives here: their agreed rent stays as it is until you change it on the tenant. */
  occupied: boolean
}

/** Round to the nearest ₹10, never below ₹0. */
function applyRule(from: number, rule: RentRule): number {
  const raw =
    rule.kind === 'set'
      ? rule.amount
      : rule.kind === 'add'
        ? from + rule.amount
        : from * (1 + rule.percent / 100)
  return Math.max(0, Math.round(raw / 1000) * 1000)
}

export function rentPreview(rooms: Room[], rule: RentRule, stays?: StayIndex): RentChange[] {
  const out: RentChange[] = []
  for (const r of rooms) {
    if (r.letting === 'whole') {
      const from = r.monthly_rent ?? 0
      out.push({
        roomId: r.id,
        roomNumber: r.number,
        bedId: null,
        label: `Room ${r.number} (whole room)`,
        from,
        to: applyRule(from, rule),
        occupied: Boolean(stays?.byRoom.get(r.id)),
      })
      continue
    }
    for (const b of r.beds) {
      out.push({
        roomId: r.id,
        roomNumber: r.number,
        bedId: b.id,
        label: `Room ${r.number} · Bed ${b.label}`,
        from: b.monthly_rent,
        to: applyRule(b.monthly_rent, rule),
        occupied: b.status === 'occupied',
      })
    }
  }
  return out
}

/* ---------------------------------------------------------------- maintenance */

export interface BlockPlan {
  /** Beds that will change. */
  change: { bed: Bed; room: Room }[]
  /** Beds left as they are because a tenant lives there (occupied beds change only at checkout). */
  skippedOccupied: { bed: Bed; room: Room }[]
  /** Beds already in the wanted state. */
  unchanged: number
}

export function maintenancePlan(rooms: Room[], block: boolean): BlockPlan {
  const plan: BlockPlan = { change: [], skippedOccupied: [], unchanged: 0 }
  for (const room of rooms)
    for (const bed of room.beds) {
      if (bed.status === 'occupied') plan.skippedOccupied.push({ bed, room })
      else if (block ? bed.status === 'blocked' : bed.status !== 'blocked') plan.unchanged += 1
      else plan.change.push({ bed, room })
    }
  return plan
}
