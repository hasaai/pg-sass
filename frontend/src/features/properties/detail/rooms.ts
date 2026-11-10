/** Pure helpers for the rooms and flats screens (unit tested). */
import type { Floor, RentalUnit, Room } from '../../../api/types'
import { floorName } from '../labels'

export interface RoomGroup {
  key: string
  title: string
  subtitle?: string
  rooms: Room[]
}

/** Rooms grouped by flat (when the property has flats), otherwise by floor. */
export function groupRooms(rooms: Room[], units: RentalUnit[], floors: Floor[]): RoomGroup[] {
  const byNumber = (a: Room, b: Room) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  if (units.length > 0) {
    const shown = units.filter(
      (u) => u.letting === 'by_parts' || rooms.some((r) => r.unit === u.id),
    )
    const groups: RoomGroup[] = shown.map((u) => ({
      key: u.id,
      title: u.code,
      subtitle: `${u.unit_type_label} · ${u.letting_label}`,
      rooms: rooms.filter((r) => r.unit === u.id).sort(byNumber),
    }))
    const loose = rooms.filter((r) => !r.unit).sort(byNumber)
    if (loose.length) groups.push({ key: 'none', title: 'Rooms on their own', rooms: loose })
    return groups
  }
  const ordered = [...floors].sort((a, b) => a.number - b.number)
  const groups: RoomGroup[] = ordered.map((f) => ({
    key: f.id,
    title: f.display_name,
    rooms: rooms.filter((r) => r.floor === f.id).sort(byNumber),
  }))
  const noFloor = rooms.filter((r) => !r.floor).sort(byNumber)
  if (noFloor.length) groups.push({ key: 'none', title: 'No floor set', rooms: noFloor })
  return groups.filter((g) => g.rooms.length > 0)
}

/** Floor choices: the ones the property has, plus the next few up to its number of floors. */
export function floorChoices(floors: Floor[], totalFloors?: number | null) {
  const known = new Map(floors.map((f) => [f.number, f.display_name]))
  const top = Math.max(totalFloors ? totalFloors - 1 : 3, ...floors.map((f) => f.number + 1), 3)
  const numbers = new Set<number>([...known.keys()])
  for (let n = 0; n <= Math.min(top, 60); n++) numbers.add(n)
  return [...numbers]
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: known.get(n) ?? floorName(n) }))
}

export function nextBedLabel(taken: string[]): string {
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!taken.includes(letter)) return letter
  return String(taken.length + 1)
}

export const MAX_QUICK_ROOMS = 100

/** Room numbers from "101" to "105"; a single room when "to" is empty or not a number. */
export function roomNumbers(from: string, to: string): string[] {
  const a = from.trim()
  const b = to.trim()
  if (!a) return []
  if (!b || b === a || !/^\d+$/.test(a) || !/^\d+$/.test(b)) return [a]
  const start = Number(a)
  const end = Number(b)
  if (end < start) return []
  const width = a.length
  return Array.from({ length: Math.min(end - start + 1, MAX_QUICK_ROOMS + 1) }, (_, i) =>
    String(start + i).padStart(width, '0'),
  )
}

const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function quickAddCsv(opts: {
  numbers: string[]
  floor: string
  flat: string
  sharing: number
  whole: boolean
  rent: string
  ac: boolean
  bath: boolean
  features: Record<string, string> // key -> '' (included) or rupees (extra)
}): string {
  const keys = Object.keys(opts.features)
  const header = [
    'room',
    'floor',
    'sharing',
    'rent_per_bed',
    'whole_room_rent',
    'room_type',
    'ac',
    'attached_bathroom',
    'flat',
    ...keys,
  ]
  const rent = opts.rent.replace(/[₹,\s]/g, '')
  const lines = opts.numbers.map((n) =>
    [
      n,
      opts.floor,
      opts.sharing,
      opts.whole ? '' : rent,
      opts.whole ? rent : '',
      opts.sharing === 1 ? 'private' : 'shared',
      opts.ac ? 'yes' : 'no',
      opts.bath ? 'yes' : 'no',
      opts.flat,
      ...keys.map((k) => (opts.features[k] ?? '').trim() || 'yes'),
    ]
      .map(cell)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n') + '\n'
}

/** The next free room number after the highest one in a group ("101" -> "102"). */
export function nextRoomNumber(rooms: Room[], fallback: string): string {
  const numbers = rooms.map((r) => r.number).filter((n) => /^\d+$/.test(n))
  if (!numbers.length) return fallback
  const top = numbers.reduce((a, b) => (Number(b) > Number(a) ? b : a))
  return String(Number(top) + 1).padStart(top.length, '0')
}
