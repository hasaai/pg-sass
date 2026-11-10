/** Everything about the signed-in tenant (Priya Sharma), read from the shared store. */
import { useMemo } from 'react'

import { TODAY } from '../../data/seed'
import { useDb } from '../../data/store'
import { ME_ID } from './local'

export function useMe() {
  const tenant = useDb((db) => db.tenants.find((t) => t.id === ME_ID))
  const tenants = useDb((db) => db.tenants)
  const properties = useDb((db) => db.properties)
  const beds = useDb((db) => db.beds)
  const rooms = useDb((db) => db.rooms)
  const staff = useDb((db) => db.staff)
  const allInvoices = useDb((db) => db.invoices)
  const allPayments = useDb((db) => db.payments)

  return useMemo(() => {
    const property = properties.find((p) => p.id === tenant?.propertyId)
    const bed = beds.find((b) => b.id === tenant?.bedId)
    const room = rooms.find((r) => r.id === bed?.roomId)
    const roomBeds = beds.filter((b) => b.roomId === room?.id)
    const roommates = roomBeds
      .filter((b) => b.id !== bed?.id)
      .map((b) => ({
        bed: b,
        tenant: tenants.find((t) => t.id === b.tenantId && t.status !== 'moved_out'),
      }))
    const warden =
      staff.find(
        (s) =>
          s.role === 'caretaker' &&
          s.propertyIds.includes(property?.id ?? '') &&
          s.status === 'active',
      ) ?? staff.find((s) => s.propertyIds.includes(property?.id ?? ''))
    const invoices = allInvoices
      .filter((i) => i.tenantId === tenant?.id)
      .sort((a, b) => b.period.localeCompare(a.period))
    const payments = allPayments
      .filter((p) => p.tenantId === tenant?.id)
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
    const unpaid = invoices.filter((i) => i.status !== 'paid')
    const current = invoices.find((i) => i.period === TODAY.slice(0, 7)) ?? invoices[0]
    const place = room
      ? room.sharing === 1
        ? `Room ${room.number}`
        : `Room ${room.number} · Bed ${bed?.label}`
      : 'No bed yet'
    return {
      tenant,
      property,
      bed,
      room,
      roommates,
      warden,
      invoices,
      payments,
      unpaid,
      current,
      place,
    }
  }, [tenant, tenants, properties, beds, rooms, staff, allInvoices, allPayments])
}

export function nextReceiptNumber(receipts: string[]) {
  const max = receipts.reduce((m, r) => Math.max(m, Number(r.replace(/\D/g, '')) || 0), 0)
  return `RCPT-${String(max + 1).padStart(5, '0')}`
}

export function firstName(name: string) {
  return name.split(' ')[0] ?? name
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
