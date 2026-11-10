import { Ban, BookmarkCheck, CircleCheck, IndianRupee, Trash2, User, UserPlus } from 'lucide-react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '../../../components/ui-kit/menu'
import { BED_STATUS } from '../../../data/selectors'
import type { Bed, Room, Tenant } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { formatMoney } from '../../../lib/format'
import { removeBed, setBedStatus } from '../actions'

/** Tap a bed → what you can do with it. `children` is the trigger (chip or dot). */
export function BedMenu({
  bed,
  room,
  tenant,
  onEditRent,
  children,
}: {
  bed: Bed
  room: Room
  tenant?: Tenant
  onEditRent: (bed: Bed) => void
  children: ReactElement
}) {
  const { can } = useSession()
  const navigate = useNavigate()
  const manage = can('properties.manage')
  const money = can('rent.view')
  const free = !bed.tenantId
  return (
    <Menu>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent align="start" className="min-w-56">
        <MenuLabel>
          Room {room.number} · Bed {bed.label} · {BED_STATUS[bed.status].label}
          {money && <span className="block font-normal">{formatMoney(bed.rent)} a month</span>}
        </MenuLabel>
        <MenuSeparator />
        {tenant && (
          <MenuItem icon={<User />} onSelect={() => navigate(`/app/tenants/${tenant.id}`)}>
            View {tenant.name}
          </MenuItem>
        )}
        {free && can('tenants.manage') && bed.status !== 'blocked' && (
          <MenuItem icon={<UserPlus />} onSelect={() => navigate(`/app/tenants/new?bed=${bed.id}`)}>
            Add tenant to this bed
          </MenuItem>
        )}
        {manage && free && (
          <>
            {bed.status !== 'vacant' && (
              <MenuItem icon={<CircleCheck />} onSelect={() => setBedStatus(bed, room, 'vacant')}>
                Mark available
              </MenuItem>
            )}
            {bed.status !== 'reserved' && (
              <MenuItem
                icon={<BookmarkCheck />}
                onSelect={() => setBedStatus(bed, room, 'reserved')}
              >
                Reserve
              </MenuItem>
            )}
            {bed.status !== 'blocked' && (
              <MenuItem icon={<Ban />} onSelect={() => setBedStatus(bed, room, 'blocked')}>
                Block (repairs, owner use)
              </MenuItem>
            )}
          </>
        )}
        {manage && money && (
          <MenuItem icon={<IndianRupee />} onSelect={() => onEditRent(bed)}>
            Edit rent
          </MenuItem>
        )}
        {manage && free && (
          <>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} destructive onSelect={() => removeBed(bed, room)}>
              Remove bed
            </MenuItem>
          </>
        )}
        {!manage && !tenant && (
          <MenuItem disabled>Only owners and managers can change beds</MenuItem>
        )}
      </MenuContent>
    </Menu>
  )
}
