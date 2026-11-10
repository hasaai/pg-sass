/** Changes to properties, rooms and beds. Each one updates the store and logs the activity. */
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { floorName } from '../../data/selectors'
import { getDb, logActivity, newId, updateDb } from '../../data/store'
import type { Bed, Property, Room } from '../../data/types'
import { plural } from '../../lib/format'
import { BED_LETTERS, extra, floorLabel, makeRoom } from './lib'
import type { PropertyX } from './lib'

export function patchProperty(id: string, patch: Partial<PropertyX>, log?: string) {
  updateDb((db) => {
    db.properties = db.properties.map((p) => (p.id === id ? ({ ...p, ...patch } as PropertyX) : p))
    const p = db.properties.find((x) => x.id === id)
    if (log && p) logActivity(db, { kind: 'property', action: log, target: p.name, propertyId: id })
  })
}

export function setPropertyStatus(p: Property, status: Property['status']) {
  if (status === 'active') {
    const db = getDb()
    const hasBeds = db.beds.some((b) => b.propertyId === p.id)
    if (!hasBeds) {
      toast.error(`${p.name} has no rooms yet. Add at least one room before opening it.`)
      return false
    }
  }
  const words = {
    active: 'Opened for tenants',
    inactive: 'Closed for now',
    archived: 'Archived',
    draft: 'Moved back to not finished',
  }[status]
  patchProperty(p.id, { status }, `${words}`)
  toast.success(
    status === 'active'
      ? `${p.name} is open for tenants`
      : status === 'inactive'
        ? `${p.name} is closed for now. Tenants staying there are not affected.`
        : status === 'archived'
          ? `${p.name} archived`
          : `${p.name} saved`,
  )
  return true
}

export function sendForChecking(p: Property) {
  updateDb((db) => {
    db.properties = db.properties.map((x) =>
      x.id === p.id
        ? ({
            ...x,
            verification: 'submitted',
            verificationLog: [
              ...(extra(x).verificationLog ?? []),
              {
                on: TODAY,
                by: 'Asha Rao',
                text: `Sent for checking with ${plural(x.documents.length, 'document')}.`,
              },
            ],
          } as PropertyX)
        : x,
    )
    db.verificationQueue = [
      {
        id: newId('vq'),
        kind: 'property',
        business: db.business.name,
        subject: p.name,
        submittedOn: TODAY,
        status: 'submitted',
        documents: p.documents.map((d) => d.kind),
        locality: p.locality,
      },
      ...db.verificationQueue,
    ]
    logActivity(db, {
      kind: 'property',
      action: 'Sent the property for checking',
      target: p.name,
      propertyId: p.id,
    })
  })
  toast.success('Sent for checking. The PG Manager team usually replies in 1–2 working days.')
}

/* ------------------------------------------------------------------ rooms */

export interface NewRoomInput {
  floor: number
  number: string
  sharing: number
  letting: Room['letting']
  rent: number
  ac: boolean
  attachedBath: boolean
  features: Room['features']
}

/** Add rooms (and their beds). Returns an error message instead when a number is taken. */
export function addRooms(property: Property, list: NewRoomInput[]): string | null {
  const db = getDb()
  const taken = new Set(
    db.rooms.filter((r) => r.propertyId === property.id).map((r) => r.number.toLowerCase()),
  )
  const dup = list.filter((r) => taken.has(r.number.toLowerCase())).map((r) => r.number)
  if (dup.length)
    return dup.length === 1
      ? `Room ${dup[0]} is already in ${property.name}. Choose another number.`
      : `Rooms ${dup.slice(0, 5).join(', ')}${dup.length > 5 ? '…' : ''} are already in ${property.name}. Choose other numbers.`
  const made = list.map((r) =>
    makeRoom({ ...r, propertyId: property.id, id: newId(`${property.id}-r`) }),
  )
  const beds = made.reduce((s, m) => s + m.beds.length, 0)
  const maxFloor = Math.max(...list.map((r) => r.floor))
  updateDb((d) => {
    d.rooms = [...d.rooms, ...made.map((m) => m.room)]
    d.beds = [...d.beds, ...made.flatMap((m) => m.beds)]
    if (maxFloor > property.floors)
      d.properties = d.properties.map((p) =>
        p.id === property.id ? { ...p, floors: maxFloor } : p,
      )
    const floors = [...new Set(list.map((r) => r.floor))]
    logActivity(d, {
      kind: 'property',
      action: `Added ${plural(list.length, 'room')} with ${plural(beds, 'bed')}${floors.length === 1 ? ` on the ${floorLabel(property, floors[0]!).toLowerCase()}` : ''}`,
      target: property.name,
      propertyId: property.id,
    })
  })
  toast.success(`${plural(list.length, 'room')} and ${plural(beds, 'bed')} added`)
  return null
}

export function deleteRoom(room: Room, propertyName: string): string | null {
  const db = getDb()
  const withTenant = db.beds.filter((b) => b.roomId === room.id && b.tenantId)
  if (withTenant.length)
    return `Room ${room.number} has ${plural(withTenant.length, 'tenant')}. Move ${withTenant.length === 1 ? 'them' : 'them'} to another bed first.`
  updateDb((d) => {
    d.rooms = d.rooms.filter((r) => r.id !== room.id)
    d.beds = d.beds.filter((b) => b.roomId !== room.id)
    logActivity(d, {
      kind: 'property',
      action: `Deleted room ${room.number}`,
      target: propertyName,
      propertyId: room.propertyId,
    })
  })
  toast.success(`Room ${room.number} deleted`)
  return null
}

/** Save the room; adds or removes free beds to match the sharing. */
export function saveRoom(room: Room, next: NewRoomInput): string | null {
  const db = getDb()
  const others = db.rooms.filter((r) => r.propertyId === room.propertyId && r.id !== room.id)
  if (others.some((r) => r.number.toLowerCase() === next.number.toLowerCase()))
    return `Room ${next.number} is already used. Choose another number.`
  const beds = db.beds
    .filter((b) => b.roomId === room.id)
    .sort((a, b) => a.label.localeCompare(b.label))
  const extraBeds = beds.length - next.sharing
  if (extraBeds > 0) {
    const removable = beds.filter((b) => !b.tenantId)
    if (removable.length < extraBeds)
      return `${plural(beds.length - removable.length, 'bed')} in this room ${beds.length - removable.length === 1 ? 'has' : 'have'} a tenant. Sharing can’t be lower than ${beds.length - removable.length}.`
  }
  const rentPerBed = next.letting === 'by_bed' ? next.rent : Math.round(next.rent / next.sharing)
  updateDb((d) => {
    d.rooms = d.rooms.map((r) =>
      r.id === room.id
        ? {
            ...r,
            number: next.number,
            floor: next.floor,
            sharing: next.sharing,
            letting: next.letting,
            type: next.sharing === 1 ? 'private' : next.sharing >= 5 ? 'dormitory' : 'shared',
            ac: next.ac,
            attachedBath: next.attachedBath,
            rentPerBed,
            wholeRent: next.letting === 'whole' || next.sharing === 1 ? next.rent : 0,
            features: next.features,
          }
        : r,
    )
    const roomBeds = d.beds.filter((b) => b.roomId === room.id)
    if (extraBeds > 0) {
      const drop = new Set(
        roomBeds
          .filter((b) => !b.tenantId)
          .sort((a, b) => b.label.localeCompare(a.label))
          .slice(0, extraBeds)
          .map((b) => b.id),
      )
      d.beds = d.beds.filter((b) => !drop.has(b.id))
    } else if (extraBeds < 0) {
      const used = new Set(roomBeds.map((b) => b.label))
      const free = [...BED_LETTERS].filter((l) => !used.has(l)).slice(0, -extraBeds)
      d.beds = [
        ...d.beds,
        ...free.map((label): Bed => ({
          id: `${room.id}-${label}-${newId('')}`,
          roomId: room.id,
          propertyId: room.propertyId,
          label,
          rent: rentPerBed,
          status: 'vacant',
        })),
      ]
    }
    d.beds = d.beds.map((b) => (b.roomId === room.id ? { ...b, rent: rentPerBed } : b))
    const p = d.properties.find((x) => x.id === room.propertyId)
    if (p && next.floor > p.floors)
      d.properties = d.properties.map((x) => (x.id === p.id ? { ...x, floors: next.floor } : x))
    logActivity(d, {
      kind: 'property',
      action: `Changed room ${next.number}`,
      target: p?.name ?? '',
      propertyId: room.propertyId,
    })
  })
  toast.success(`Room ${next.number} saved`)
  return null
}

/* ------------------------------------------------------------------ beds */

export function addBed(room: Room) {
  const db = getDb()
  const used = new Set(db.beds.filter((b) => b.roomId === room.id).map((b) => b.label))
  const label = [...BED_LETTERS].find((l) => !used.has(l))
  if (!label || used.size >= room.sharing) {
    toast.error(`Room ${room.number} already has ${room.sharing} beds. Raise the sharing first.`)
    return
  }
  updateDb((d) => {
    d.beds = [
      ...d.beds,
      {
        id: `${room.id}-${label}-${newId('')}`,
        roomId: room.id,
        propertyId: room.propertyId,
        label,
        rent: room.rentPerBed,
        status: 'vacant',
      },
    ]
    logActivity(d, {
      kind: 'property',
      action: `Added bed ${label} to room ${room.number}`,
      target: d.properties.find((p) => p.id === room.propertyId)?.name ?? '',
      propertyId: room.propertyId,
    })
  })
  toast.success(`Bed ${label} added to room ${room.number}`)
}

export function setBedStatus(bed: Bed, room: Room, status: Bed['status']) {
  const words = {
    vacant: 'is available',
    reserved: 'is reserved',
    blocked: 'is marked not available',
    occupied: 'filled',
    notice: 'on notice',
  }[status]
  updateDb((d) => {
    d.beds = d.beds.map((b) => (b.id === bed.id ? { ...b, status } : b))
    logActivity(d, {
      kind: 'property',
      action: `Room ${room.number} · Bed ${bed.label} ${words}`,
      target: d.properties.find((p) => p.id === room.propertyId)?.name ?? '',
      propertyId: room.propertyId,
    })
  })
  toast.success(`Room ${room.number} · Bed ${bed.label} ${words}`)
}

export function setBedRent(bed: Bed, room: Room, rent: number) {
  updateDb((d) => {
    d.beds = d.beds.map((b) => (b.id === bed.id ? { ...b, rent } : b))
    logActivity(d, {
      kind: 'property',
      action: `Changed the rent of room ${room.number} · Bed ${bed.label}`,
      target: d.properties.find((p) => p.id === room.propertyId)?.name ?? '',
      propertyId: room.propertyId,
    })
  })
  toast.success(`Rent of bed ${bed.label} in room ${room.number} saved`)
}

export function removeBed(bed: Bed, room: Room) {
  if (bed.tenantId) {
    toast.error(`Bed ${bed.label} has a tenant. Move them out first.`)
    return
  }
  updateDb((d) => {
    d.beds = d.beds.filter((b) => b.id !== bed.id)
    logActivity(d, {
      kind: 'property',
      action: `Removed bed ${bed.label} from room ${room.number}`,
      target: d.properties.find((p) => p.id === room.propertyId)?.name ?? '',
      propertyId: room.propertyId,
    })
  })
  toast.success(`Bed ${bed.label} removed from room ${room.number}`)
}

/* ------------------------------------------------------------------ floors */

export function renameFloor(p: Property, floor: number, name: string) {
  const names = { ...(extra(p).floorNames ?? {}) }
  if (name.trim() && name.trim() !== floorName(floor)) names[floor] = name.trim()
  else if (floor === 0) names[0] = floorName(0)
  else delete names[floor]
  patchProperty(p.id, { floorNames: names })
}

export function addFloor(p: Property, where: 'top' | 'ground') {
  if (where === 'ground') {
    patchProperty(
      p.id,
      { floorNames: { ...(extra(p).floorNames ?? {}), 0: floorName(0) } },
      'Added the ground floor',
    )
    toast.success('Ground floor added')
  } else {
    patchProperty(
      p.id,
      { floors: p.floors + 1 },
      `Added the ${floorName(p.floors + 1).toLowerCase()}`,
    )
    toast.success(`${floorName(p.floors + 1)} added`)
  }
}

export function removeFloor(p: Property, floor: number) {
  const names = { ...(extra(p).floorNames ?? {}) }
  delete names[floor]
  patchProperty(
    p.id,
    floor === 0 ? { floorNames: names } : { floors: p.floors - 1, floorNames: names },
    `Removed the ${floorLabel(p, floor).toLowerCase()}`,
  )
  toast.success(`${floorLabel(p, floor)} removed`)
}
