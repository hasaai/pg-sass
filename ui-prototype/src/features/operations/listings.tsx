/** Online listing: how each property appears to people searching for a PG. */
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Inbox,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Star,
  Store,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { LineTabs, NoAccess, PhotoTile, Section, Switch } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Alert, EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { AMENITY_CATALOG, TODAY } from '../../data/seed'
import { GENDER } from '../../data/selectors'
import { logActivity, updateDb, useDb } from '../../data/store'
import type { Db } from '../../data/store'
import type { Property } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatMoney, paiseToRupeesInput, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import type { ListingSettings } from './extras'
import { updateExtras, useExtras } from './extras'
import { daysBetween } from './helpers'

const RATING: Record<string, { stars: number; reviews: number }> = {
  p1: { stars: 4.6, reviews: 38 },
  p2: { stars: 4.3, reviews: 21 },
}

function sharingOptions(db: Db, propertyId: string) {
  const rooms = db.rooms.filter((r) => r.propertyId === propertyId)
  const map = new Map<number, number>()
  for (const r of rooms) {
    const rent = r.letting === 'whole' ? r.wholeRent : r.rentPerBed
    if (!rent) continue
    map.set(r.sharing, Math.min(map.get(r.sharing) ?? Infinity, rent))
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sharing, from]) => ({ sharing, from }))
}

function defaults(db: Db, p: Property): ListingSettings {
  const opts = sharingOptions(db, p.id)
  return {
    headline: `${p.name}, ${p.locality}`,
    description: p.description,
    sharings: opts.map((o) => o.sharing),
    priceFrom: opts.length ? Math.min(...opts.map((o) => o.from)) : 0,
    showPhone: true,
    showWhatsApp: true,
    published: false,
  }
}

const sharingLabel = (n: number) => (n === 1 ? 'Single' : `${n} sharing`)

export function ListingsPage() {
  useBreadcrumbs([{ label: 'Online listing' }])
  const { can } = useSession()
  const properties = useDb((db) => db.properties)
  const list = properties.filter((p) => p.status !== 'archived')
  const [selected, setSelected] = useState(list[0]?.id ?? '')

  if (!can('properties.manage')) return <NoAccess what="the online listing" />
  const property = list.find((p) => p.id === selected) ?? list[0]

  return (
    <>
      <PageHeader
        title="Online listing"
        description="Your PG on the PG Manager marketplace, where people search for a place to stay."
      />
      {!property ? (
        <EmptyState icon={<Store />} title="Add a property first">
          Once a property is set up you can list it online here.
        </EmptyState>
      ) : (
        <>
          <LineTabs
            tabs={list.map((p) => ({ value: p.id, label: p.name }))}
            value={property.id}
            onChange={setSelected}
          />
          <ListingEditor key={property.id} property={property} />
        </>
      )}
    </>
  )
}

function ListingEditor({ property: p }: { property: Property }) {
  const { person } = useSession()
  const db = useDb((d) => d)
  const saved = useExtras((x) => x.listings[p.id])
  const stats = useExtras((x) => x.listingStats[p.id])
  const settings = saved ?? defaults(db, p)
  const [form, setForm] = useState<ListingSettings>(settings)
  const [price, setPrice] = useState(
    settings.priceFrom ? paiseToRupeesInput(settings.priceFrom) : '',
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof ListingSettings>(k: K, v: ListingSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const options = sharingOptions(db, p.id)
  const ownerOk = db.business.verification === 'approved'
  const propertyOk = p.verification === 'verified'
  const canPublish = ownerOk && propertyOk && p.status === 'active'
  const status = !canPublish ? 'needs' : settings.published ? 'live' : 'off'
  const STATUS = {
    live: { label: 'Published', tone: 'good' as const },
    off: { label: 'Not published', tone: 'neutral' as const },
    needs: { label: 'Needs verification', tone: 'warn' as const },
  }
  const recentEnquiries = db.enquiries.filter(
    (e) => e.propertyId === p.id && daysBetween(e.createdOn, TODAY) <= 30,
  ).length
  const amenities = p.amenities
    .map((k) => AMENITY_CATALOG.find((a) => a.key === k)?.name)
    .filter(Boolean) as string[]
  const rating = RATING[p.id]
  const dirty =
    JSON.stringify({ ...form, priceFrom: rupeesToPaise(price) }) !== JSON.stringify(settings)

  const checks = [
    {
      ok: propertyOk,
      label: 'Property verified',
      hint: propertyOk
        ? 'Ownership papers checked by PG Manager'
        : 'Upload a proof document and send it for checking',
      to: `/app/properties/${p.id}?tab=verification`,
      action: 'Open Verification',
    },
    {
      ok: ownerOk,
      label: 'Your identity verified',
      hint: ownerOk ? 'Owner ID checked' : 'Add your ID so seekers know the owner is real',
      to: '/app/verify-identity',
      action: 'Verify identity',
    },
    {
      ok: p.status === 'active',
      label: 'Property open',
      hint:
        p.status === 'active'
          ? 'Rooms and beds are set up'
          : 'Finish adding rooms and beds, then open it',
      to: `/app/properties/${p.id}`,
      action: 'Open property',
    },
    {
      ok: p.photos.length >= 3,
      label: 'At least 3 photos',
      hint: `${p.photos.length} photo${p.photos.length === 1 ? '' : 's'} added`,
      to: `/app/properties/${p.id}?tab=photos`,
      action: 'Add photos',
    },
  ]

  function save(publish?: boolean) {
    const e: Record<string, string> = {}
    const paise = rupeesToPaise(price)
    if (form.headline.trim().length < 6) e.headline = 'Write a short title people will see first.'
    if (form.description.trim().length < 30)
      e.description = 'Describe the PG in at least one or two sentences.'
    if (!form.sharings.length) e.sharings = 'Show at least one kind of room.'
    if (paise === null || paise <= 0) e.price = 'Type the lowest rent per month, e.g. 8500.'
    setErrors(e)
    if (Object.keys(e).length || paise === null) return
    const next = { ...form, priceFrom: paise, published: publish ?? settings.published }
    updateExtras((x) => void (x.listings[p.id] = next))
    if (publish !== undefined) {
      updateDb((d) =>
        logActivity(d, {
          by: person.name,
          kind: 'property',
          action: publish ? 'Published the online listing' : 'Took the online listing down',
          target: p.name,
          propertyId: p.id,
        }),
      )
    }
    setForm(next)
    toast.success(
      publish === true
        ? `${p.name} is now live on the marketplace`
        : publish === false
          ? `${p.name} is hidden from the marketplace`
          : 'Listing saved',
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-10 items-center justify-center rounded-full',
              status === 'live'
                ? 'bg-emerald-50 text-emerald-600'
                : status === 'needs'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-secondary text-muted-foreground',
            )}
          >
            {status === 'live' ? (
              <Eye className="size-5" />
            ) : status === 'needs' ? (
              <CircleAlert className="size-5" />
            ) : (
              <EyeOff className="size-5" />
            )}
          </span>
          <div>
            <Badge tone={STATUS[status].tone} dot>
              {STATUS[status].label}
            </Badge>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === 'live'
                ? 'People searching in ' + p.locality + ' can see and contact you.'
                : status === 'needs'
                  ? 'Finish the checks below before the listing can go live.'
                  : 'Ready to publish. Only you can see this preview.'}
            </p>
          </div>
        </div>
        {status === 'live' ? (
          <Button variant="outline" onClick={() => save(false)}>
            <EyeOff /> Unpublish
          </Button>
        ) : (
          <Button onClick={() => save(true)} disabled={!canPublish}>
            <Eye /> Publish listing
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Views" value={stats?.views ?? 0} icon={<Eye />} hint="Last 30 days" />
        <StatCard
          label="Calls & WhatsApp"
          value={stats?.calls ?? 0}
          icon={<PhoneCall />}
          hint="Last 30 days"
        />
        <StatCard
          label="Enquiries"
          value={recentEnquiries}
          icon={<Inbox />}
          hint={
            <Link to="/app/enquiries" className="text-primary hover:underline">
              See enquiries
            </Link>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Section title="Before you publish" bodyClassName="p-0">
            <ul className="divide-y">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                      c.ok
                        ? 'bg-emerald-500 text-white'
                        : 'border-2 border-amber-400 text-amber-500',
                    )}
                  >
                    {c.ok ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : (
                      <X className="size-3" strokeWidth={3} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                  {!c.ok && (
                    <Button asChild variant="link" size="sm" className="shrink-0">
                      <Link to={c.to}>{c.action}</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              How seekers see it
            </p>
            <article className="overflow-hidden rounded-xl border bg-card shadow-md">
              <div className="relative">
                <PhotoTile hue={p.photos[0]?.hue ?? 210} className="aspect-[16/10] rounded-none" />
                {propertyOk && (
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 shadow">
                    <BadgeCheck className="size-3.5" /> Verified
                  </span>
                )}
                <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
                  1 / {Math.max(1, p.photos.length)}
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="leading-snug font-semibold">{form.headline || p.name}</h3>
                  {rating ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                      {rating.stars} <Star className="size-3 fill-current" />
                    </span>
                  ) : (
                    <Badge tone="info">New</Badge>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" /> {p.locality}, {p.city}
                  {rating && ` · ${rating.reviews} reviews`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="outline">{GENDER[p.gender]}</Badge>
                  {p.foodIncluded && <Badge tone="outline">Food included</Badge>}
                  {form.sharings.map((s) => (
                    <Badge key={s}>{sharingLabel(s)}</Badge>
                  ))}
                </div>
                <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">
                  {form.description}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {amenities.slice(0, 5).join(' · ')}
                  {amenities.length > 5 && ` · +${amenities.length - 5} more`}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Starts from</p>
                    <p className="text-lg font-semibold">
                      {formatMoney(rupeesToPaise(price) ?? 0)}
                      <span className="text-xs font-normal text-muted-foreground"> /month</span>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {form.showPhone && (
                      <span className="inline-flex size-8 items-center justify-center rounded-md border">
                        <Phone className="size-4" />
                      </span>
                    )}
                    {form.showWhatsApp && (
                      <span className="inline-flex size-8 items-center justify-center rounded-md border text-emerald-600">
                        <MessageCircle className="size-4" />
                      </span>
                    )}
                    <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
                      Book a visit
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        <Section
          title="Listing details"
          className="lg:col-span-3"
          actions={
            <Button size="sm" onClick={() => save()} disabled={!dirty}>
              Save changes
            </Button>
          }
        >
          <div className="grid gap-4">
            <Field
              label="Title"
              required
              error={errors.headline}
              hint="Shown in bold in search results"
            >
              <Input
                value={form.headline}
                maxLength={70}
                onChange={(e) => set('headline', e.target.value)}
              />
            </Field>
            <Field
              label="About the PG"
              required
              error={errors.description}
              hint={`${form.description.length} / 600 letters`}
            >
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value.slice(0, 600))}
                className="min-h-28"
              />
            </Field>
            <Field label="Rooms to show" error={errors.sharings}>
              {options.length === 0 ? (
                <Alert tone="warn">
                  No rooms yet.{' '}
                  <Link to={`/app/properties/${p.id}`} className="font-medium underline">
                    Add rooms and beds
                  </Link>{' '}
                  to show prices.
                </Alert>
              ) : (
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {options.map((o) => (
                    <CheckboxRow
                      key={o.sharing}
                      label={sharingLabel(o.sharing)}
                      hint={`From ${formatMoney(o.from)} a month`}
                      checked={form.sharings.includes(o.sharing)}
                      onCheckedChange={(v) => {
                        const next =
                          v === true
                            ? [...form.sharings, o.sharing].sort()
                            : form.sharings.filter((s) => s !== o.sharing)
                        set('sharings', next)
                        const low = options
                          .filter((x) => next.includes(x.sharing))
                          .map((x) => x.from)
                        if (low.length) setPrice(paiseToRupeesInput(Math.min(...low)))
                      }}
                    />
                  ))}
                </div>
              )}
            </Field>
            <Field
              label="Starting price per month (₹)"
              required
              error={errors.price}
              hint="We fill in the lowest rent of the rooms you show. You can change it."
            >
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <div className="divide-y rounded-lg border px-3">
              <Switch
                checked={form.showPhone}
                onChange={(v) => set('showPhone', v)}
                label="Show phone number"
                description={`Seekers can call ${p.contactPhone}`}
              />
              <Switch
                checked={form.showWhatsApp}
                onChange={(v) => set('showWhatsApp', v)}
                label="Show WhatsApp button"
                description="Messages come to the same number"
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
