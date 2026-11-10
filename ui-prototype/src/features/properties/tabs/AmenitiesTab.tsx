import { useState } from 'react'

import { Button } from '../../../components/ui-kit/button'
import { toast } from '../../../components/ui-kit/toast'
import { AMENITY_CATALOG } from '../../../data/seed'
import type { Property } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { plural } from '../../../lib/format'
import { patchProperty } from '../actions'
import { AmenityEditor } from '../AmenityEditor'
import { AMENITY_GROUPS, amenityName } from '../lib'
import { Badge } from '../../../components/ui-kit/badge'

export function AmenitiesTab({ property }: { property: Property }) {
  const { can } = useSession()
  const [value, setValue] = useState(property.amenities)
  const dirty = [...value].sort().join() !== [...property.amenities].sort().join()

  if (!can('properties.manage'))
    return (
      <div className="grid gap-4 rounded-xl border bg-card p-5">
        {AMENITY_GROUPS.map((g) => {
          const list = AMENITY_CATALOG.filter(
            (a) => a.group === g && property.amenities.includes(a.key),
          )
          return (
            <div key={g}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g}</p>
              <div className="flex flex-wrap gap-1.5">
                {list.length ? (
                  list.map((a) => (
                    <Badge key={a.key} tone="outline">
                      {amenityName(a.key)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[13px] text-muted-foreground">None</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )

  return (
    <div className="grid gap-4">
      <div className="sticky top-14 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-xs backdrop-blur">
        <p className="text-[13px]">
          <strong>{plural(value.length, 'amenity', 'amenities')}</strong> chosen
          {dirty && <span className="ml-2 text-amber-700">· Not saved yet</span>}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!dirty} onClick={() => setValue(property.amenities)}>
            Undo changes
          </Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              patchProperty(property.id, { amenities: value }, 'Changed the amenities')
              toast.success('Amenities saved')
            }}
          >
            Save amenities
          </Button>
        </div>
      </div>
      <AmenityEditor value={value} onChange={setValue} />
    </div>
  )
}
