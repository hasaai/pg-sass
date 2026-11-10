import { Archive, Building, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../api/client'
import { useApiMutation } from '../../../api/hooks'
import type { Floor, Property, RentalUnit } from '../../../api/types'
import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { Card } from '../../../components/ui-kit/card'
import { ConfirmDialog } from '../../../components/ui-kit/confirm'
import { EmptyState } from '../../../components/ui-kit/feedback'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui-kit/table'
import { toast } from '../../../components/ui-kit/toast'
import { formatMoney } from '../../../lib/format'
import { PROPERTY_QUERIES } from '../api'
import { typeInfo } from '../propertyTypes'
import { UnitDialog } from './dialogs'

function UnitActions({
  unit,
  property,
  floors,
}: {
  unit: RentalUnit
  property: Property
  floors: Floor[]
}) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const archive = useApiMutation(() => api.post(`/units/${unit.id}/archive/`), PROPERTY_QUERIES)
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${unit.code}`}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
            Edit
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Archive />} destructive onSelect={() => setRemoving(true)}>
            Remove
          </MenuItem>
        </MenuContent>
      </Menu>
      {editing && (
        <UnitDialog
          open
          onOpenChange={setEditing}
          property={property}
          floors={floors}
          unit={unit}
        />
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${unit.code}?`}
        confirmLabel="Remove"
        destructive
        busy={archive.isPending}
        error={archive.error}
        onConfirm={() =>
          archive.mutate(undefined, {
            onSuccess: () => {
              setRemoving(false)
              toast.success(`${unit.code} removed`)
            },
          })
        }
      >
        <p>
          {unit.code} and its rooms are hidden from your lists and can’t take tenants. Their history
          is kept. Not possible while tenants live there.
        </p>
      </ConfirmDialog>
    </>
  )
}

export function UnitsTab({
  property,
  floors,
  units,
  canManage,
}: {
  property: Property
  floors: Floor[]
  units: RentalUnit[]
  canManage: boolean
}) {
  const info = typeInfo(property.property_type)
  const word = info.unitWord ?? 'Flat'
  const plural = info.unitWordPlural ?? 'Flats'
  const [adding, setAdding] = useState(false)
  const floorOrder = new Map(floors.map((f) => [f.id, f.number]))
  const sorted = [...units].sort(
    (a, b) =>
      (floorOrder.get(a.floor ?? '') ?? 999) - (floorOrder.get(b.floor ?? '') ?? 999) ||
      a.code.localeCompare(b.code, undefined, { numeric: true }),
  )
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {units.length
            ? `${units.length} ${units.length === 1 ? word.toLowerCase() : plural.toLowerCase()}`
            : ''}
        </p>
        {canManage && (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add {word.toLowerCase()}
          </Button>
        )}
      </div>
      {units.length === 0 ? (
        <EmptyState
          icon={<Building />}
          title={`No ${plural.toLowerCase()} yet`}
          actions={
            canManage && (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add the first {word.toLowerCase()}
              </Button>
            )
          }
        >
          Add each {word.toLowerCase()} with its size and rent. Rent it as a whole to a family or
          group, or room by room.
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>{word}</TH>
                <TH className="hidden sm:table-cell">Floor</TH>
                <TH>How it’s rented</TH>
                <TH className="text-right">Rent</TH>
                <TH className="hidden md:table-cell">Rooms</TH>
                <TH className="hidden lg:table-cell">Status</TH>
                {canManage && (
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </TR>
            </THead>
            <TBody>
              {sorted.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <p className="font-medium">{u.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        u.unit_type_label,
                        u.bedrooms != null ? `${u.bedrooms} bed` : null,
                        u.bathrooms != null ? `${u.bathrooms} bath` : null,
                        u.area_sqft ? `${u.area_sqft} sq ft` : null,
                        u.furnishing_label || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </TD>
                  <TD className="hidden text-[13px] sm:table-cell">{u.floor_name || '—'}</TD>
                  <TD>
                    <Badge tone={u.letting === 'whole' ? 'info' : 'outline'}>
                      {u.letting_label}
                    </Badge>
                  </TD>
                  <TD className="text-right text-[13px] tabular-nums">
                    {u.letting === 'whole' ? (
                      u.monthly_rent ? (
                        <>
                          {formatMoney(u.monthly_rent)}
                          <span className="text-muted-foreground">/mo</span>
                        </>
                      ) : (
                        <span className="text-amber-700">Not set</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">Per room</span>
                    )}
                  </TD>
                  <TD className="hidden text-[13px] md:table-cell">{u.rooms_count || '—'}</TD>
                  <TD className="hidden lg:table-cell">
                    <Badge tone={u.status === 'available' ? 'good' : 'neutral'} dot>
                      {u.status_label}
                    </Badge>
                  </TD>
                  {canManage && (
                    <TD>
                      <UnitActions unit={u} property={property} floors={floors} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {adding && <UnitDialog open onOpenChange={setAdding} property={property} floors={floors} />}
    </div>
  )
}
