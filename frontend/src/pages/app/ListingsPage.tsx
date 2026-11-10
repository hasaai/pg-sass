import {
  BadgeCheck,
  BedDouble,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  ImageIcon,
  Images,
  Inbox,
  MapPin,
  Pencil,
  Plus,
  Store,
} from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { api } from '../../api/client'
import { useApiMutation, useList } from '../../api/hooks'
import type { Listing, Property } from '../../api/types'
import { PhotoManager } from '../../components/PhotoManager'
import { Checkbox, ErrorBanner, SelectField, TextAreaField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui-kit/feedback'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import { useForm } from '../../lib/useForm'

const FIELDS = ['property', 'headline', 'description', 'contact_phone', 'house_rules']

function ListingForm({
  listing,
  properties,
  onDone,
  onCancel,
}: {
  listing?: Listing
  properties: Property[]
  onDone: () => void
  onCancel: () => void
}) {
  const form = useForm({
    property: listing?.property ?? '',
    headline: listing?.headline ?? '',
    description: listing?.description ?? '',
    contact_phone: listing?.contact_phone ?? '',
    house_rules: listing?.house_rules ?? '',
    food_included: listing?.food_included ?? false,
    is_published: listing?.is_published ?? true,
  })
  const save = useApiMutation(
    (b: Record<string, unknown>) =>
      listing ? api.patch(`/listings/${listing.id}/`, b) : api.post('/listings/', b),
    ['/listings/'],
    onDone,
  )
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    save.mutate(form.values, { onError: form.setError })
  }
  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <ErrorBanner error={form.error} fields={FIELDS} />
      {!listing && (
        <SelectField
          label="Property"
          placeholder="Choose"
          options={properties.map((p) => ({ value: p.id, label: p.name }))}
          error={form.fieldError('property')}
          {...form.bind('property')}
        />
      )}
      <TextField
        label="Headline"
        required
        placeholder="e.g. Safe PG for women near HSR BDA"
        error={form.fieldError('headline')}
        {...form.bind('headline')}
      />
      <TextAreaField label="Description" rows={5} {...form.bind('description')} />
      <TextField
        label="Public contact mobile"
        type="tel"
        error={form.fieldError('contact_phone')}
        {...form.bind('contact_phone')}
      />
      <TextAreaField label="House rules" rows={3} {...form.bind('house_rules')} />
      <div className="grid gap-3 rounded-lg border bg-secondary/40 p-4">
        <Checkbox label="Food included" {...form.bindCheck('food_included')} />
        <Checkbox
          label="Published (visible on the marketplace)"
          {...form.bindCheck('is_published')}
        />
      </div>
      <div className="sticky -bottom-5 -mx-6 -mb-5 mt-1 flex flex-wrap justify-end gap-2 border-t bg-card px-6 py-3.5">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" busy={save.isPending}>
          {listing ? 'Save listing' : 'Create listing'}
        </Button>
      </div>
    </form>
  )
}

const MAX_PHOTOS = 15

function ListingPhotos({ listing }: { listing: Listing }) {
  return (
    <PhotoManager
      photos={listing.photos}
      uploadPath={`/listings/${listing.id}/photos/`}
      itemPath={(id) => `/listing-photos/${id}/`}
      invalidate={['/listings/']}
      max={MAX_PHOTOS}
      hint="Photos of the property (added on the property page) are shown first. Add listing-only photos here, e.g. the room that is free now. JPG, PNG or WebP up to 5 MB."
    />
  )
}

function ListingCard({
  l,
  onEdit,
  onPhotos,
}: {
  l: Listing
  onEdit: () => void
  onPhotos: () => void
}) {
  const cover = l.photos[0]
  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-sm">
      <div className="relative aspect-[16/9] overflow-hidden border-b bg-secondary">
        {cover ? (
          <img
            src={cover.url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <button
            type="button"
            onClick={onPhotos}
            className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ImageIcon className="size-6" aria-hidden />
            Add a cover photo
          </button>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Badge tone={l.is_published ? 'good' : 'neutral'} className="shadow-xs">
            {l.is_published ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            {l.is_published ? 'Published' : 'Hidden'}
          </Badge>
          {l.is_verified ? (
            <Badge tone="good" className="shadow-xs">
              <BadgeCheck aria-hidden /> Verified
            </Badge>
          ) : (
            <Badge tone="warn" className="shadow-xs">
              <Clock aria-hidden /> Awaiting verification
            </Badge>
          )}
        </div>
        {l.photos.length > 0 && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-md bg-[oklch(0.2_0.02_230/0.65)] px-1.5 py-0.5 text-[11.5px] font-medium text-white tabular-nums backdrop-blur-sm">
            <Images className="size-3" aria-hidden /> {l.photos.length}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        <h2 className="line-clamp-2 text-[15px] leading-6 font-semibold tracking-[-0.01em]">
          {l.headline}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {l.property_name} · {l.locality}
          </span>
        </p>

        {l.options.length > 0 && (
          <ul className="mt-4 divide-y rounded-lg border">
            {l.options.map((o) => (
              <li
                key={o.sharing}
                className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
              >
                <span className="flex items-center gap-2 text-secondary-foreground">
                  <BedDouble className="size-3.5 text-muted-foreground" aria-hidden />
                  {o.sharing} sharing
                </span>
                <span className="flex items-center gap-2.5 tabular-nums">
                  <span>
                    <span className="text-muted-foreground">from </span>
                    <span className="font-semibold">{formatMoney(o.min_rent)}</span>
                  </span>
                  <span
                    className={cn(
                      'w-16 text-right text-xs',
                      o.vacant_beds > 0 ? 'font-medium text-emerald-700' : 'text-subtle-foreground',
                    )}
                  >
                    {o.vacant_beds} vacant
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {l.enquiries_new > 0 && (
          <Link
            to="/app/enquiries"
            className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 no-underline hover:underline"
          >
            <Inbox className="size-3.5" aria-hidden />
            {l.enquiries_new} new enquiries
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil /> Edit
        </Button>
        <Button variant="outline" size="sm" onClick={onPhotos}>
          <Images /> Photos ({l.photos.length})
        </Button>
        {l.is_published && (
          <a
            href={`/pg/${l.slug}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-primary no-underline hover:underline"
          >
            View public page <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </Card>
  )
}

export function ListingsPage() {
  const listings = useList<Listing>('/listings/')
  const properties = useList<Property>('/properties/')
  const [editing, setEditing] = useState<Listing | 'new' | null>(null)
  const [photosFor, setPhotosFor] = useState<string | null>(null)
  const photoListing = listings.rows.find((l) => l.id === photosFor)
  const unlisted = properties.rows.filter((p) => !listings.rows.some((l) => l.property === p.id))
  const rows = listings.rows
  const vacant = rows.reduce((sum, l) => sum + l.options.reduce((s, o) => s + o.vacant_beds, 0), 0)
  const newEnquiries = rows.reduce((sum, l) => sum + l.enquiries_new, 0)
  return (
    <>
      <PageHeader
        title="Marketplace listings"
        description="Public pages for your properties. Vacancy and rents update from your beds."
        actions={
          unlisted.length > 0 && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> New listing
            </Button>
          )
        }
      />
      <ErrorBanner error={listings.error} />
      {listings.isLoading ? (
        <div className="grid gap-5" role="status" aria-label="Loading">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[400px] rounded-xl" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="No listings yet."
          actions={
            unlisted.length > 0 ? (
              <Button onClick={() => setEditing('new')}>
                <Plus /> New listing
              </Button>
            ) : (
              !properties.rows.length && (
                <Button variant="outline" asChild>
                  <Link to="/app/properties/new">
                    <Plus /> Add a property
                  </Link>
                </Button>
              )
            )
          }
        >
          <p>
            {properties.rows.length
              ? 'Create a listing so people can find your PG.'
              : 'Add a property first.'}
          </p>
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Listings" value={rows.length} icon={<Store />} />
            <StatCard
              label="Published"
              value={rows.filter((l) => l.is_published).length}
              icon={<Eye />}
            />
            <StatCard label="Vacant beds listed" value={vacant} icon={<BedDouble />} />
            <StatCard label="New enquiries" value={newEnquiries} icon={<Inbox />} />
          </div>
          {rows.some((l) => !l.is_verified) && (
            <Alert tone="info">
              New listings appear on the marketplace after the PG Manager team verifies them (we
              call you and check the photos), usually within a day.
            </Alert>
          )}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((l) => (
              <ListingCard
                key={l.id}
                l={l}
                onEdit={() => setEditing(l)}
                onPhotos={() => setPhotosFor(l.id)}
              />
            ))}
          </div>
        </div>
      )}
      <Dialog
        open={photoListing !== undefined}
        onOpenChange={(open) => !open && setPhotosFor(null)}
        title="Listing photos"
        description={photoListing?.headline}
        className="max-w-2xl"
      >
        {photoListing && <ListingPhotos listing={photoListing} />}
      </Dialog>
      <Dialog
        variant="side"
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New listing' : 'Edit listing'}
        description={
          editing && editing !== 'new'
            ? editing.property_name
            : 'Choose a property and write what makes it a good place to stay.'
        }
      >
        {editing !== null && (
          <ListingForm
            listing={editing === 'new' ? undefined : editing}
            properties={unlisted}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  )
}
