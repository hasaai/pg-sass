import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BedDouble,
  Building,
  ChevronDown,
  CircleCheck,
  DoorOpen,
  ExternalLink,
  FileText,
  Images,
  Layers,
  LayoutGrid,
  MapPin,
  Pencil,
  Power,
  PowerOff,
  Sparkles,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { useApi } from '../../../api/hooks'
import type { Property, PropertyAmenity } from '../../../api/types'
import { useAuth } from '../../../auth/AuthContext'
import { AmenityGroups } from '../../../components/AmenityGroups'
import { PhotoManager } from '../../../components/PhotoManager'
import { useBreadcrumbs } from '../../../components/shell/crumbs'
import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../../components/ui-kit/card'
import { ConfirmDialog } from '../../../components/ui-kit/confirm'
import {
  Alert,
  EmptyState,
  ErrorAlert,
  Meter,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../../components/ui-kit/feedback'
import { LogoUploader } from '../../../components/ui-kit/logo-uploader'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../../components/ui-kit/menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui-kit/tabs'
import { toast } from '../../../components/ui-kit/toast'
import { fromOperator } from '../../../lib/amenities'
import { formatMoney } from '../../../lib/format'
import { googleMapsLink } from '../../../lib/location'
import {
  PROPERTY_QUERIES,
  statusActions,
  useInventory,
  useProperty,
  useReadiness,
  useStatusAction,
} from '../api'
import type { StatusAction } from '../api'
import {
  GENDER_OPTIONS,
  MAX_PROPERTY_PHOTOS,
  PROPERTY_STATUS_TONE,
  VERIFICATION_TONE,
} from '../labels'
import { roomsTabLabel, typeInfo } from '../propertyTypes'
import { DocumentsTab } from './DocumentsTab'
import { RoomsTab } from './RoomsTab'
import { UnitsTab } from './UnitsTab'

const ACTION_ICONS: Record<StatusAction, ReactNode> = {
  activate: <Power />,
  deactivate: <PowerOff />,
  archive: <Archive />,
  restore: <ArchiveRestore />,
}

/** What is left before the property can open, with the button to open it. */
export function ReadinessPanel({
  property,
  canManage,
}: {
  property: Property
  canManage: boolean
}) {
  const show = property.status === 'draft' || property.status === 'inactive'
  const readiness = useReadiness(property.id, show)
  const change = useStatusAction((p) => toast.success(`${p.name} is open`))
  if (!show) return null
  if (readiness.isLoading) return <Skeleton className="h-20" />
  const problems = readiness.data?.problems ?? []
  const ready = problems.length === 0
  return (
    <Alert
      tone={ready ? 'good' : 'warn'}
      title={
        ready
          ? property.status === 'draft'
            ? 'Everything needed is in place. Open the property when you are ready.'
            : 'This property is closed. Open it again to take new tenants.'
          : `Before tenants can move in, finish ${problems.length === 1 ? 'this' : 'these'}:`
      }
      actions={
        canManage && (
          <Button
            size="sm"
            busy={change.isPending}
            disabled={!ready}
            onClick={() =>
              change.mutate(
                { id: property.id, action: 'activate' },
                { onError: (e) => toast.error(e.message) },
              )
            }
          >
            <Power /> Open property
          </Button>
        )
      }
    >
      {!ready && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {problems.map((p) => (
            <li key={`${p.code}-${p.target_id}`}>{p.message}</li>
          ))}
        </ul>
      )}
    </Alert>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

function PropertyLogo({ property, canEdit }: { property: Property; canEdit: boolean }) {
  const queryClient = useQueryClient()
  return (
    <LogoUploader
      path={`/properties/${property.id}/logo/`}
      logoUrl={property.logo_url}
      name={property.name}
      canEdit={canEdit}
      onChanged={() =>
        queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('/properties/'),
        })
      }
    />
  )
}

function Overview({ property, amenities }: { property: Property; amenities: PropertyAmenity[] }) {
  const info = typeInfo(property.property_type)
  const navigate = useNavigate()
  const { can } = useAuth()
  const canManage = can('properties.manage')
  const gender = GENDER_OPTIONS.find((g) => g.value === property.gender)?.label
  const edit = (step: string) => navigate(`/app/properties/${property.id}/edit?step=${step}`)
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="grid min-w-0 gap-5 xl:col-span-2">
        <Card>
          <CardHeader
            title="Details"
            actions={
              canManage && (
                <Button variant="outline" size="sm" onClick={() => edit('details')}>
                  <Pencil /> Edit
                </Button>
              )
            }
          />
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Property ID">{property.reference}</Detail>
              <Detail label="Type of place">{info.label}</Detail>
              <Detail label="Contact number">{property.contact_phone}</Detail>
              {info.sharedLiving && <Detail label="Who can stay">{gender}</Detail>}
              {info.asks.buildingName && <Detail label="Building">{property.building_name}</Detail>}
              <Detail label="Address">
                {[property.address_line, property.locality].filter(Boolean).join(', ')}
              </Detail>
              <Detail label="City">
                {[property.city, property.state, property.pincode].filter(Boolean).join(', ')}
              </Detail>
              <Detail label="Landmark">{property.landmark}</Detail>
              {info.asks.totalFloors && (
                <Detail label="Floors">{property.total_floors ?? null}</Detail>
              )}
              {info.asks.area && (
                <Detail label="Built-up area">
                  {property.built_up_area_sqft ? `${property.built_up_area_sqft} sq ft` : null}
                </Detail>
              )}
              {info.asks.yearBuilt && (
                <Detail label="Year built">{property.year_built ?? null}</Detail>
              )}
              <Detail label="Rent due on">Day {property.rent_due_day} of the month</Detail>
              <Detail label="Map">
                {property.latitude && property.longitude ? (
                  <a
                    href={googleMapsLink({
                      latitude: property.latitude,
                      longitude: property.longitude,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1"
                  >
                    Open in Google Maps <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </Detail>
            </dl>
            {property.description && (
              <p className="mt-5 border-t pt-4 text-sm whitespace-pre-line text-muted-foreground">
                {property.description}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Amenities"
            actions={
              canManage && (
                <Button variant="outline" size="sm" onClick={() => edit('amenities')}>
                  <Pencil /> Edit
                </Button>
              )
            }
          />
          <CardContent className="legacy">
            {amenities.length ? (
              <AmenityGroups items={fromOperator(amenities)} />
            ) : (
              <p className="text-[13px] text-muted-foreground">No amenities added yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Logo" description="Shown on this property's page and listing." />
          <CardContent>
            <PropertyLogo property={property} canEdit={canManage} />
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader
            title="Photos"
            description={`${property.photos.length} of ${MAX_PROPERTY_PHOTOS}`}
            actions={
              canManage && (
                <Button variant="outline" size="sm" onClick={() => edit('photos')}>
                  <Images /> Manage
                </Button>
              )
            }
          />
          <CardContent>
            {property.photos.length ? (
              <div className="grid grid-cols-2 gap-2">
                {property.photos.slice(0, 6).map((p, i) => (
                  <img
                    key={p.id}
                    src={p.url}
                    alt={p.caption || `Photo ${i + 1} of ${property.name}`}
                    className={
                      i === 0
                        ? 'col-span-2 aspect-video w-full rounded-lg object-cover'
                        : 'aspect-square w-full rounded-lg object-cover'
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No photos yet. Add the building, rooms and common areas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function PropertyDetailPage() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const canManage = can('properties.manage')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const property = useProperty(id)
  const inventory = useInventory(id)
  const amenities = useApi<PropertyAmenity[]>(`/properties/${id}/amenities/`)
  const change = useStatusAction((p) => toast.success(`${p.name}: ${p.status_label}`))
  const [confirmRemove, setConfirmRemove] = useState(false)
  useBreadcrumbs([
    { label: 'Properties', to: '/app/properties' },
    { label: property.data?.name ?? '…' },
  ])

  if (property.isLoading)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-12 w-80" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  if (property.error || !property.data)
    return (
      <EmptyState
        title="Property not found"
        actions={
          <Button variant="outline" asChild>
            <Link to="/app/properties">Back to properties</Link>
          </Button>
        }
      >
        It may have been removed, or it belongs to another business.
      </EmptyState>
    )
  const p = property.data
  const info = typeInfo(p.property_type)
  const floors = inventory.data?.floors ?? []
  const units = inventory.data?.units ?? []
  const rooms = inventory.data?.rooms ?? []
  const tab = params.get('tab') ?? 'overview'
  const unitsWhole = units.filter((u) => u.letting === 'whole')
  const rentRange = [
    ...rooms.flatMap((r) => r.beds.map((b) => b.monthly_rent)),
    ...rooms.map((r) => r.monthly_rent ?? 0),
    ...unitsWhole.map((u) => u.monthly_rent ?? 0),
  ].filter((n) => n > 0)

  function run(action: StatusAction) {
    if (action === 'archive') return setConfirmRemove(true)
    change.mutate({ id: p.id, action }, { onError: (e) => toast.error(e.message) })
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to="/app/properties"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Properties
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {p.logo_url && (
              <img src={p.logo_url} alt="" className="size-9 rounded-lg border object-cover" />
            )}
            {p.name}
            <Badge tone={PROPERTY_STATUS_TONE[p.status]} dot>
              {p.status_label}
            </Badge>
            {p.verification_status === 'verified' && (
              <Badge tone={VERIFICATION_TONE.verified}>
                <CircleCheck /> Verified
              </Badge>
            )}
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{info.label}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {[p.address_line, p.locality, p.city].filter(Boolean).join(', ')}
            </span>
          </span>
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => navigate(`/app/properties/${p.id}/edit`)}>
                <Pencil /> Edit
              </Button>
              {statusActions(p.status).length > 0 && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="outline">
                      Status <ChevronDown />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {statusActions(p.status).map((a) => (
                      <MenuItem
                        key={a.action}
                        icon={ACTION_ICONS[a.action]}
                        destructive={a.action === 'archive'}
                        onSelect={() => run(a.action)}
                      >
                        {a.label}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              )}
            </>
          )
        }
      />

      <div className="mb-5">
        {p.status === 'archived' ? (
          <Alert
            tone="info"
            title="This property was removed."
            actions={
              canManage && (
                <Button size="sm" variant="outline" onClick={() => run('restore')}>
                  <ArchiveRestore /> Restore
                </Button>
              )
            }
          >
            It is hidden from your lists and can’t take tenants. Restore it to make changes.
          </Alert>
        ) : (
          <ReadinessPanel property={p} canManage={canManage} />
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {info.sharedLiving || p.beds_total > 0 ? (
          <StatCard
            label="Beds filled"
            value={`${p.beds_occupied} / ${p.beds_total}`}
            icon={<BedDouble />}
            hint={`${p.beds_vacant} available`}
          >
            {p.beds_total > 0 && (
              <div className="mt-2">
                <Meter value={p.beds_occupied} max={p.beds_total} label="Beds filled" />
              </div>
            )}
          </StatCard>
        ) : (
          <StatCard
            label={info.unitWordPlural ?? 'Flats'}
            value={p.units_count}
            icon={<Building />}
            hint={`${unitsWhole.length} rented as a whole`}
          />
        )}
        <StatCard
          label="Rooms"
          value={p.rooms_count}
          icon={<DoorOpen />}
          hint={info.sharedLiving ? 'Across all floors' : 'Optional for this type'}
        />
        <StatCard
          label="Floors"
          value={p.floors_count || '—'}
          icon={<Layers />}
          hint={p.total_floors ? `Building has ${p.total_floors}` : 'Added with rooms'}
        />
        <StatCard
          label="Rent"
          value={rentRange.length ? formatMoney(Math.min(...rentRange)) : '—'}
          icon={<Sparkles />}
          hint={
            rentRange.length > 1 && Math.max(...rentRange) !== Math.min(...rentRange)
              ? `Up to ${formatMoney(Math.max(...rentRange))} per month`
              : rentRange.length
                ? 'Per month'
                : 'Not set yet'
          }
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutGrid /> Overview
          </TabsTrigger>
          {info.unitWordPlural && (
            <TabsTrigger value="units">
              <Building /> {info.unitWordPlural}
              <span className="rounded-full bg-secondary px-1.5 text-xs">{units.length}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="rooms">
            <DoorOpen /> {roomsTabLabel(p.property_type)}
            <span className="rounded-full bg-secondary px-1.5 text-xs">{rooms.length}</span>
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText /> Documents
          </TabsTrigger>
          <TabsTrigger value="photos">
            <Images /> Photos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview property={p} amenities={amenities.data ?? []} />
        </TabsContent>
        {info.unitWordPlural && (
          <TabsContent value="units">
            {inventory.isLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <UnitsTab
                property={p}
                floors={floors}
                units={units}
                canManage={canManage && p.status !== 'archived'}
              />
            )}
          </TabsContent>
        )}
        <TabsContent value="rooms">
          <ErrorAlert error={inventory.error} />
          {inventory.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <RoomsTab
              property={p}
              floors={floors}
              units={units}
              rooms={rooms}
              canManage={canManage && p.status !== 'archived'}
              canSeeTenants={can('tenants.view')}
              showMoney={can('rent.view') || canManage}
            />
          )}
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab property={p} canManage={can('properties.documents')} />
        </TabsContent>
        <TabsContent value="photos">
          <Card>
            <CardHeader
              title="Photos"
              description="Building, rooms, bathrooms, kitchen and common areas. The first photo is the cover."
            />
            <CardContent className="legacy">
              <PhotoManager
                photos={p.photos}
                uploadPath={`/properties/${p.id}/photos/`}
                itemPath={(photoId) => `/property-photos/${photoId}/`}
                invalidate={PROPERTY_QUERIES}
                max={MAX_PROPERTY_PHOTOS}
                canEdit={canManage}
                hint="JPG, PNG or WebP up to 5 MB."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${p.name}?`}
        confirmLabel="Remove"
        destructive
        busy={change.isPending}
        error={change.error}
        onConfirm={() =>
          change.mutate(
            { id: p.id, action: 'archive' },
            { onSuccess: () => setConfirmRemove(false) },
          )
        }
      >
        <p>
          It disappears from your lists and can’t take tenants. Nothing is deleted: old tenancies
          and invoices stay, and you can restore it any time.
        </p>
      </ConfirmDialog>
    </>
  )
}
