import {
  Archive,
  ArchiveRestore,
  BedDouble,
  Building2,
  Check,
  Circle,
  DoorOpen,
  ExternalLink,
  IndianRupee,
  Layers,
  MapPin,
  MoreHorizontal,
  Pencil,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { LineTabs, PhotoTile, Status } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Alert, EmptyState, Meter, StatCard } from '../../components/ui-kit/feedback'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { GENDER, PROPERTY_STATUS, PROPERTY_TYPE, VERIFICATION } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { Property } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatMoney, plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { sendForChecking, setPropertyStatus } from './actions'
import { CopyButton } from './bits'
import {
  bedCounts,
  expectedRent,
  floorsOf,
  fullAddress,
  mapsUrl,
  rentRangeLabel,
  roomPrice,
} from './lib'
import { RoomsTab } from './rooms/RoomsTab'
import { AmenitiesTab } from './tabs/AmenitiesTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { OverviewTab } from './tabs/OverviewTab'
import { PhotosTab } from './tabs/PhotosTab'
import { SettingsTab } from './tabs/SettingsTab'
import { TenantsTab } from './tabs/TenantsTab'
import { VerificationTab } from './tabs/VerificationTab'

export type TabKey =
  | 'overview'
  | 'rooms'
  | 'tenants'
  | 'amenities'
  | 'photos'
  | 'documents'
  | 'verification'
  | 'settings'

export function PropertyDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { can } = useSession()
  const property = useDb((db) => db.properties.find((p) => p.id === id))
  const allRooms = useDb((db) => db.rooms)
  const allBeds = useDb((db) => db.beds)
  const tenants = useDb((db) => db.tenants)
  const [params, setParams] = useSearchParams()
  const [archiving, setArchiving] = useState(false)
  useBreadcrumbs([
    { label: 'Properties', to: '/app/properties' },
    { label: property?.name ?? 'Not found' },
  ])

  const rooms = useMemo(() => allRooms.filter((r) => r.propertyId === id), [allRooms, id])
  const beds = useMemo(() => allBeds.filter((b) => b.propertyId === id), [allBeds, id])
  const staying = useMemo(
    () => tenants.filter((t) => t.propertyId === id && t.status !== 'moved_out'),
    [tenants, id],
  )

  if (!property)
    return (
      <EmptyState
        icon={<Building2 />}
        title="Property not found"
        actions={<Button onClick={() => navigate('/app/properties')}>Back to properties</Button>}
      >
        It may have been removed, or the link is wrong.
      </EmptyState>
    )

  const manage = can('properties.manage')
  const money = can('rent.view')
  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'rooms', label: 'Rooms & beds', count: rooms.length },
    { value: 'tenants', label: 'Tenants', count: staying.length },
    { value: 'amenities', label: 'Amenities', count: property.amenities.length },
    { value: 'photos', label: 'Photos', count: property.photos.length },
    ...(can('properties.documents')
      ? [{ value: 'documents' as const, label: 'Documents', count: property.documents.length }]
      : []),
    { value: 'verification', label: 'Verification' },
    ...(manage ? [{ value: 'settings' as const, label: 'Settings' }] : []),
  ]
  const asked = params.get('tab') as TabKey | null
  const tab: TabKey = asked && tabs.some((t) => t.value === asked) ? asked : 'overview'
  const setTab = (t: TabKey) => {
    setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  }

  const c = bedCounts(beds)
  const floors = floorsOf(property, rooms)
  const canSend = ['unverified', 'changes_requested', 'rejected'].includes(property.verification)

  return (
    <div>
      {/* Header */}
      <div className="mb-5 overflow-hidden rounded-xl border bg-card shadow-xs">
        <PhotoTile
          hue={property.photos[0]?.hue ?? 220}
          className="aspect-auto h-28 rounded-none md:h-40"
        />
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{property.name}</h1>
              <CopyButton text={property.reference} label="Copy PG number" />
            </div>
            <p className="mt-1 flex items-start gap-1.5 text-[13px] text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {fullAddress(property)}
                {property.landmark && ` · ${property.landmark}`}{' '}
                <a
                  href={mapsUrl(property)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-primary hover:underline"
                >
                  Open in Google Maps <ExternalLink className="size-3" />
                </a>
              </span>
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Status of={PROPERTY_STATUS} value={property.status} />
              <Status of={VERIFICATION} value={property.verification} />
              <Badge tone="outline">{PROPERTY_TYPE[property.type]}</Badge>
              <Badge tone="outline">{GENDER[property.gender]}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('tenants.manage') && property.status !== 'archived' && (
              <Button
                variant="outline"
                onClick={() => navigate(`/app/tenants/new?property=${property.id}`)}
              >
                <UserPlus /> Add tenant
              </Button>
            )}
            {manage && (
              <>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/app/properties/${property.id}/edit`)}
                >
                  <Pencil /> Edit
                </Button>
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="More actions">
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem
                      icon={<Pencil />}
                      onSelect={() => navigate(`/app/properties/${property.id}/edit`)}
                    >
                      Edit details
                    </MenuItem>
                    {property.status === 'active' && (
                      <MenuItem
                        icon={<PauseCircle />}
                        onSelect={() => setPropertyStatus(property, 'inactive')}
                      >
                        Close for now
                      </MenuItem>
                    )}
                    {(property.status === 'inactive' || property.status === 'draft') && (
                      <MenuItem
                        icon={<PlayCircle />}
                        onSelect={() => setPropertyStatus(property, 'active')}
                      >
                        Open for tenants
                      </MenuItem>
                    )}
                    {property.status === 'archived' && (
                      <MenuItem
                        icon={<ArchiveRestore />}
                        onSelect={() => setPropertyStatus(property, 'inactive')}
                      >
                        Restore
                      </MenuItem>
                    )}
                    {canSend && (
                      <MenuItem icon={<ShieldCheck />} onSelect={() => sendForChecking(property)}>
                        Send for checking
                      </MenuItem>
                    )}
                    {property.status !== 'archived' && (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          icon={<Archive />}
                          destructive
                          onSelect={() => setArchiving(true)}
                        >
                          Archive
                        </MenuItem>
                      </>
                    )}
                  </MenuContent>
                </Menu>
              </>
            )}
          </div>
        </div>
      </div>

      <StatusAlert
        property={property}
        roomCount={rooms.length}
        allPriced={rooms.every((r) => roomPrice(r) > 0)}
        manage={manage}
        goTo={setTab}
      />

      {/* KPIs */}
      <div
        className={cn('mb-6 grid grid-cols-2 gap-3', money ? 'lg:grid-cols-5' : 'lg:grid-cols-3')}
      >
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Beds filled" value={`${c.filled} / ${c.total}`} icon={<BedDouble />}>
            <div className="mt-2">
              <Meter value={c.filled} max={c.total} label="Beds filled" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {c.pct}% full · <span className="text-emerald-700">{c.vacant} free</span>
            </p>
          </StatCard>
        </div>
        <StatCard
          label="Rooms"
          value={rooms.length}
          icon={<DoorOpen />}
          hint={plural(c.total, 'bed')}
        />
        <StatCard
          label="Floors"
          value={floors.length}
          icon={<Layers />}
          hint={
            floors.length
              ? `${floors.filter((f) => rooms.some((r) => r.floor === f)).length} with rooms`
              : undefined
          }
        />
        {money && (
          <>
            <StatCard
              label="Rent range"
              value={<span className="text-lg">{rentRangeLabel(rooms)}</span>}
              icon={<IndianRupee />}
              hint="Per bed or room, a month"
            />
            <StatCard
              label="Monthly expected rent"
              value={formatMoney(expectedRent(rooms, beds))}
              icon={<Wallet />}
              hint={`From ${plural(c.filled, 'filled bed')}`}
            />
          </>
        )}
      </div>

      <LineTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab property={property} rooms={rooms} />}
      {tab === 'rooms' && <RoomsTab property={property} />}
      {tab === 'tenants' && <TenantsTab property={property} />}
      {tab === 'amenities' && <AmenitiesTab key={property.amenities.join()} property={property} />}
      {tab === 'photos' && <PhotosTab property={property} />}
      {tab === 'documents' && <DocumentsTab property={property} />}
      {tab === 'verification' && <VerificationTab property={property} goTo={setTab} />}
      {tab === 'settings' && (
        <SettingsTab property={property} onArchive={() => setArchiving(true)} />
      )}

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Archive ${property.name}?`}
        confirmLabel={staying.length ? 'OK' : 'Archive property'}
        destructive={!staying.length}
        onConfirm={() => {
          setArchiving(false)
          if (staying.length) return
          setPropertyStatus(property, 'archived')
          setArchiving(false)
        }}
      >
        {staying.length ? (
          <Alert tone="bad">
            {plural(staying.length, 'tenant')} still {staying.length === 1 ? 'stays' : 'stay'} here.
            Move them out or to another property first.
          </Alert>
        ) : (
          <p>
            It is hidden from your lists and reports, and can’t take new tenants. Its rooms, bills
            and history are kept, and you can restore it any time.
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}

function StatusAlert({
  property,
  roomCount,
  allPriced,
  manage,
  goTo,
}: {
  property: Property
  roomCount: number
  allPriced: boolean
  manage: boolean
  goTo: (t: TabKey) => void
}) {
  if (property.status === 'inactive')
    return (
      <Alert
        tone="warn"
        className="mb-5"
        title="Closed for now"
        actions={
          manage && (
            <Button size="sm" onClick={() => setPropertyStatus(property, 'active')}>
              Open again
            </Button>
          )
        }
      >
        New tenants can’t be added and it is hidden from your listing. Tenants staying now are not
        affected.
      </Alert>
    )
  if (property.status === 'archived')
    return (
      <Alert
        tone="info"
        className="mb-5"
        title="This property is archived"
        actions={
          manage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPropertyStatus(property, 'inactive')}
            >
              Restore
            </Button>
          )
        }
      >
        Its history is kept. Restore it to make changes or add tenants again.
      </Alert>
    )
  if (property.status !== 'draft') return null

  const items: { done: boolean; label: string; hint: string; tab: TabKey; required?: boolean }[] = [
    {
      done: roomCount > 0,
      label: 'Add at least one room',
      hint: 'Beds are made for you from the sharing.',
      tab: 'rooms',
      required: true,
    },
    {
      done: roomCount > 0 && allPriced,
      label: 'Set the rent of every room',
      hint: 'So bills can be made.',
      tab: 'rooms',
      required: true,
    },
    {
      done: property.photos.length >= 3,
      label: 'Add at least 3 photos',
      hint: `${property.photos.length} added so far.`,
      tab: 'photos',
    },
    {
      done: Boolean(property.contactPhone),
      label: 'Add a contact number',
      hint: 'Shown to tenants.',
      tab: 'settings',
    },
    {
      done: property.documents.length > 0,
      label: 'Upload the rental agreement or ownership papers',
      hint: 'Needed to get verified.',
      tab: 'documents',
    },
  ]
  const ready = items.filter((i) => i.required).every((i) => i.done)
  const doneCount = items.filter((i) => i.done).length
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-950">Finish setting up {property.name}</p>
          <p className="text-[13px] text-amber-900/80">
            {doneCount} of {items.length} done. It stays <strong>Not finished</strong> until you
            open it for tenants.
          </p>
        </div>
        {manage && (
          <Button disabled={!ready} onClick={() => setPropertyStatus(property, 'active')}>
            <PlayCircle /> Open for tenants
          </Button>
        )}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.label}>
            <button
              type="button"
              onClick={() => goTo(i.tab)}
              className="flex w-full items-start gap-2.5 rounded-lg border border-amber-200/70 bg-card px-3 py-2.5 text-left hover:border-amber-300"
            >
              {i.done ? (
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              )}
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[13px] font-medium',
                    i.done && 'text-muted-foreground line-through',
                  )}
                >
                  {i.label}
                  {i.required && !i.done && (
                    <span className="ml-1 text-xs font-normal text-amber-700">(needed)</span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{i.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
