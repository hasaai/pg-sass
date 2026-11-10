import { Phone } from 'lucide-react'

import { Avatar, DetailList, Section } from '../../../components/common'
import { Badge } from '../../../components/ui-kit/badge'
import { GENDER, PROPERTY_TYPE, STAFF_ROLE } from '../../../data/selectors'
import { ROLE_INFO } from '../../../data/seed'
import { useDb } from '../../../data/store'
import type { Property, Room } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { formatDate, formatMoney } from '../../../lib/format'
import { MapPlaceholder } from '../bits'
import { AMENITY_GROUPS, amenityName, extra, fullAddress, mapsUrl } from '../lib'
import { AMENITY_CATALOG } from '../../../data/seed'

export function OverviewTab({ property: p, rooms }: { property: Property; rooms: Room[] }) {
  const { can } = useSession()
  const staffAll = useDb((db) => db.staff)
  const membersAll = useDb((db) => db.members)
  const lateFeeDefault = useDb((db) => db.settings.lateFeePerDay)
  const x = extra(p)
  const staff = staffAll.filter((s) => s.propertyIds.includes(p.id) && s.status !== 'left')
  const team = membersAll.filter(
    (m) => m.role !== 'owner' && (m.propertyIds.length === 0 || m.propertyIds.includes(p.id)),
  )
  const sharings = [...new Set(rooms.map((r) => r.sharing))].sort()

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-5">
        <Section title="About this place">
          {p.description && (
            <p className="mb-5 text-sm leading-relaxed text-foreground/90">{p.description}</p>
          )}
          <DetailList
            items={[
              ['Kind of place', PROPERTY_TYPE[p.type]],
              ['Who can stay', GENDER[p.gender]],
              ['PG number', <span className="font-mono">{p.reference}</span>],
              ['Floors with rooms', String(p.floors)],
              [
                'Room types',
                sharings.length
                  ? sharings.map((s) => (s === 1 ? 'Single' : `${s} sharing`)).join(', ')
                  : 'No rooms yet',
              ],
              ['Food', p.foodIncluded ? 'Included in rent' : 'Not included'],
              ['Year built', x.yearBuilt ?? ''],
              ['Added on', formatDate(p.createdOn)],
            ]}
          />
        </Section>

        <Section title="Rent rules">
          <DetailList
            cols={4}
            items={[
              ['Rent due', `${p.rentDueDay} of every month`],
              [
                'Deposit',
                `${p.depositMonths} ${p.depositMonths === 1 ? 'month' : 'months'} of rent`,
              ],
              ['Notice to move out', `${p.noticeDays} days`],
              ...(can('rent.view')
                ? ([['Late fee', `${formatMoney(x.lateFeePerDay ?? lateFeeDefault)} a day`]] as [
                    string,
                    string,
                  ][])
                : []),
            ]}
          />
        </Section>

        <Section
          title="Amenities"
          description={`${p.amenities.length} of ${AMENITY_CATALOG.length}`}
        >
          {p.amenities.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No amenities chosen yet.</p>
          ) : (
            <div className="grid gap-3">
              {AMENITY_GROUPS.map((g) => {
                const list = AMENITY_CATALOG.filter(
                  (a) => a.group === g && p.amenities.includes(a.key),
                )
                if (!list.length) return null
                return (
                  <div key={g} className="grid gap-1.5 sm:grid-cols-[10rem_1fr]">
                    <p className="text-xs font-medium text-muted-foreground sm:pt-1">{g}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((a) => (
                        <Badge key={a.key} tone="outline">
                          {amenityName(a.key)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="House rules">
          {p.rules.length ? (
            <ol className="grid gap-2">
              {p.rules.map((r, i) => (
                <li key={r} className="flex gap-3 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  {r}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted-foreground">No house rules yet.</p>
          )}
        </Section>
      </div>

      <div className="grid content-start gap-5">
        <Section title="Location" bodyClassName="p-0">
          <MapPlaceholder
            label={p.name}
            href={mapsUrl(p)}
            className="rounded-none border-0 border-b"
          />
          <div className="p-4 text-[13px]">
            <p>{fullAddress(p)}</p>
            {p.landmark && <p className="text-muted-foreground">{p.landmark}</p>}
          </div>
        </Section>

        <Section title="Contact">
          {p.contactPhone ? (
            <a
              href={`tel:${p.contactPhone.replace(/\s/g, '')}`}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Phone className="size-4" /> {p.contactPhone}
            </a>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No contact number. Add one in Settings.
            </p>
          )}
        </Section>

        <Section title="Staff and team" description="People who work at this place.">
          {staff.length + team.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nobody assigned yet.</p>
          ) : (
            <ul className="grid gap-3">
              {team.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.name} hue={250} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_INFO[m.role].label} · app access
                    </p>
                  </div>
                  {m.status === 'invited' && <Badge tone="info">Invited</Badge>}
                </li>
              ))}
              {staff.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <Avatar name={s.name} hue={30} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {STAFF_ROLE[s.role]} · {s.shift}
                    </p>
                  </div>
                  {s.status === 'on_leave' && <Badge tone="warn">On leave</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
