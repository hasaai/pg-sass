/** Helpers shared by the property screens (kept inside this module). */
import { AMENITY_CATALOG, ROOM_FEATURES, TODAY } from '../../data/seed'
import { floorName } from '../../data/selectors'
import type { Db } from '../../data/store'
import type { Bed, Property, Room } from '../../data/types'
import { formatMoney } from '../../lib/format'

/** Extra details a property can carry in the prototype (not in the shared type). */
export interface PropertyExtra {
  floorNames?: Record<number, string>
  yearBuilt?: string
  lateFeePerDay?: number
  verificationLog?: { on: string; text: string; by: string }[]
}

export type PropertyX = Property & PropertyExtra

export function extra(p: Property): PropertyExtra {
  return p as PropertyX
}

export const BED_LETTERS = 'ABCDEF'

export const BED_STYLE: Record<Bed['status'], string> = {
  vacant: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  occupied: 'border-blue-200 bg-blue-50 text-blue-700',
  reserved: 'border-amber-200 bg-amber-50 text-amber-800',
  blocked: 'border-slate-200 bg-slate-100 text-slate-500',
  notice: 'border-orange-200 bg-orange-50 text-orange-700',
}

export const BED_DOT: Record<Bed['status'], string> = {
  vacant: 'bg-emerald-500',
  occupied: 'bg-blue-500',
  reserved: 'bg-amber-400',
  blocked: 'bg-slate-300',
  notice: 'bg-orange-500',
}

export function floorLabel(p: Property, n: number) {
  return extra(p).floorNames?.[n] || floorName(n)
}

/** Floors to show: ground (only when used or named) and 1…floors, plus any floor with rooms. */
export function floorsOf(p: Property, rooms: Room[]) {
  const set = new Set<number>()
  for (let f = 1; f <= p.floors; f++) set.add(f)
  for (const r of rooms) set.add(r.floor)
  if (extra(p).floorNames?.[0]) set.add(0)
  return [...set].sort((a, b) => a - b)
}

export function isFilled(b: Bed) {
  return b.status === 'occupied' || b.status === 'notice'
}

export function bedCounts(beds: Bed[]) {
  const filled = beds.filter(isFilled).length
  return {
    total: beds.length,
    filled,
    vacant: beds.filter((b) => b.status === 'vacant').length,
    reserved: beds.filter((b) => b.status === 'reserved').length,
    blocked: beds.filter((b) => b.status === 'blocked').length,
    notice: beds.filter((b) => b.status === 'notice').length,
    pct: beds.length ? Math.round((filled / beds.length) * 100) : 0,
  }
}

/** Monthly price of a room as shown to people. */
export function roomPrice(r: Room) {
  return r.letting === 'whole' ? r.wholeRent : r.rentPerBed
}

export function rentRange(rooms: Room[]): [number, number] | null {
  const prices = rooms.map(roomPrice).filter((n) => n > 0)
  if (!prices.length) return null
  return [Math.min(...prices), Math.max(...prices)]
}

export function rentRangeLabel(rooms: Room[]) {
  const r = rentRange(rooms)
  if (!r) return 'No rent set'
  return r[0] === r[1] ? formatMoney(r[0]) : `${formatMoney(r[0])} – ${formatMoney(r[1])}`
}

/** Rent expected each month from the beds that are filled now. */
export function expectedRent(rooms: Room[], beds: Bed[]) {
  let total = 0
  for (const r of rooms) {
    const rb = beds.filter((b) => b.roomId === r.id)
    if (r.letting === 'whole') {
      if (rb.some(isFilled)) total += r.wholeRent
    } else total += rb.filter(isFilled).reduce((s, b) => s + b.rent, 0)
  }
  return total
}

export function roomsOfProperty(db: Db, id: string) {
  return db.rooms.filter((r) => r.propertyId === id)
}

export function compareRoomNumbers(a: string, b: string) {
  return a.localeCompare(b, 'en', { numeric: true })
}

/** "101" → "102", "G05" → "G06". */
export function nextNumber(n: string) {
  const m = n.match(/^(.*?)(\d+)$/)
  if (!m) return `${n}1`
  const [, prefix, digits] = m
  return `${prefix}${String(Number(digits) + 1).padStart(digits!.length, '0')}`
}

/** Next free room number on a floor (never one already used anywhere in the property). */
export function nextRoomNumber(floor: number, rooms: Room[]) {
  const taken = new Set(rooms.map((r) => r.number.toLowerCase()))
  const onFloor = rooms
    .filter((r) => r.floor === floor)
    .map((r) => r.number)
    .sort(compareRoomNumbers)
  let n = onFloor.at(-1) ? nextNumber(onFloor.at(-1)!) : floor === 0 ? 'G01' : `${floor}01`
  for (let i = 0; i < 500 && taken.has(n.toLowerCase()); i++) n = nextNumber(n)
  return n
}

export const MAX_QUICK_ROOMS = 40

/** "101" to "105" → ["101", …, "105"]; one number when "to" is empty. */
export function roomNumbers(from: string, to: string): string[] | 'bad' {
  const a = from.trim()
  const b = to.trim()
  if (!a) return []
  if (!b || b === a) return [a]
  const ma = a.match(/^(.*?)(\d+)$/)
  const mb = b.match(/^(.*?)(\d+)$/)
  if (!ma || !mb || ma[1] !== mb[1]) return 'bad'
  const start = Number(ma[2])
  const end = Number(mb[2])
  if (end < start) return 'bad'
  if (end - start + 1 > MAX_QUICK_ROOMS) return Array.from({ length: end - start + 1 }, () => '')
  const width = ma[2]!.length
  return Array.from(
    { length: end - start + 1 },
    (_, i) => `${ma[1]}${String(start + i).padStart(width, '0')}`,
  )
}

/** Build a room plus its beds (A, B, …) ready to push into the store. */
export function makeRoom(input: {
  propertyId: string
  id: string
  floor: number
  number: string
  sharing: number
  letting: Room['letting']
  rent: number
  ac: boolean
  attachedBath: boolean
  features: Room['features']
}): { room: Room; beds: Bed[] } {
  const room: Room = {
    id: input.id,
    propertyId: input.propertyId,
    floor: input.floor,
    number: input.number,
    sharing: input.sharing,
    letting: input.letting,
    type: input.sharing === 1 ? 'private' : input.sharing >= 5 ? 'dormitory' : 'shared',
    ac: input.ac,
    attachedBath: input.attachedBath,
    rentPerBed: input.letting === 'by_bed' ? input.rent : Math.round(input.rent / input.sharing),
    wholeRent: input.letting === 'whole' ? input.rent : input.sharing === 1 ? input.rent : 0,
    features: input.features,
  }
  const bedRent = room.rentPerBed
  const beds: Bed[] = Array.from({ length: input.sharing }, (_, i) => ({
    id: `${input.id}-${BED_LETTERS[i]}`,
    roomId: input.id,
    propertyId: input.propertyId,
    label: BED_LETTERS[i]!,
    rent: bedRent,
    status: 'vacant',
  }))
  return { room, beds }
}

export function featureName(key: string) {
  return ROOM_FEATURES.find((f) => f.key === key)?.name ?? key
}

export function docStatus(expiresOn?: string): 'ok' | 'expiring' | 'expired' {
  if (!expiresOn) return 'ok'
  if (expiresOn < TODAY) return 'expired'
  const days = (new Date(expiresOn).getTime() - new Date(TODAY).getTime()) / 86400000
  return days <= 60 ? 'expiring' : 'ok'
}

export const DOC_KINDS = [
  'Rental agreement with building owner',
  'Property ownership papers',
  'Trade licence',
  'Fire safety certificate',
  'Police verification / NOC',
  'Electricity bill',
  'Water bill',
  'Property tax receipt',
  'Other',
]

export function newReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'PG-'
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export function mapsUrl(p: Property) {
  const q = [p.name, p.address, p.locality, p.city, p.pincode].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function fullAddress(p: Property) {
  return [p.address, p.locality, `${p.city} ${p.pincode}`.trim()].filter(Boolean).join(', ')
}

/** Download text as a file in the browser. */
export function downloadText(filename: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const AMENITY_GROUPS = [...new Set(AMENITY_CATALOG.map((a) => a.group))]

export function amenityName(key: string) {
  return AMENITY_CATALOG.find((a) => a.key === key)?.name ?? key
}
