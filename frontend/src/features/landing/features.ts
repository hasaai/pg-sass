import {
  BedDouble,
  BellRing,
  Building2,
  ChartColumn,
  IdCard,
  IndianRupee,
  ShieldCheck,
  UserCog,
  Wrench,
} from 'lucide-react'
import type { ComponentType } from 'react'

export type Icon = ComponentType<{ className?: string }>

/** What the app does today. Keep in step with the operator menu (AppShell). */
export const FEATURES: { icon: Icon; title: string; text: string }[] = [
  {
    icon: Building2,
    title: 'Properties, rooms and beds',
    text: 'PGs, co-living, hostels, flats and houses. Floors, rooms, beds and sharing, or add them all from a spreadsheet.',
  },
  {
    icon: BedDouble,
    title: 'Tenants and check-in',
    text: 'Add a tenant and check them into a bed, a whole room or a whole flat on one screen. Notice, move and check-out with deposit refunds.',
  },
  {
    icon: IndianRupee,
    title: 'Rent and receipts',
    text: 'Monthly bills made for you, part payments, extras like a balcony, and receipts you can share.',
  },
  {
    icon: BellRing,
    title: 'Rent reminders',
    text: 'See who is late and send reminders on WhatsApp in one tap.',
  },
  {
    icon: ChartColumn,
    title: 'Expenses and profit',
    text: 'Electricity, food, repairs and salaries against rent collected, month by month, with downloadable reports.',
  },
  {
    icon: IdCard,
    title: 'Staff and salaries',
    text: 'Wardens, cooks and cleaners, their monthly pay, and who has been paid this month.',
  },
  {
    icon: Wrench,
    title: 'Complaints and notices',
    text: 'Log and track complaints by room, assign them, and post notices for one property or all.',
  },
  {
    icon: UserCog,
    title: 'Your team, your rules',
    text: 'Owner, manager, accountant or caretaker. Tick exactly what each person may do and which properties they see.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified properties',
    text: 'Upload ownership or rental papers privately; our team checks them and your property gets a Verified mark.',
  },
]
