import { Eye, EyeOff, FileText, Megaphone, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { formatDate } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import type { AmenityRow, Extras } from './extras'
import { Switch } from './Toggle'

const SWITCHES: { key: keyof Extras['switches']; label: string; description: string }[] = [
  {
    key: 'marketplace',
    label: 'Public PG listings',
    description:
      'People looking for a PG can search and see listings. Off while the pages are redesigned.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp rent reminders',
    description: 'Businesses on Starter and above can send reminders on WhatsApp. Off = SMS only.',
  },
  {
    key: 'csvImport',
    label: 'CSV import',
    description: 'Owners can add many rooms and beds from a spreadsheet.',
  },
  {
    key: 'tenantApp',
    label: 'Tenant app',
    description: 'Tenants can sign in to see bills, pay rent and raise complaints.',
  },
]

export function Settings() {
  useBreadcrumbs([{ label: 'Settings' }])
  const switches = useExtras((x) => x.switches)
  const amenities = useExtras((x) => x.amenities)
  const legal = useExtras((x) => x.legal)
  const maintenance = useExtras((x) => x.maintenance)
  const [editing, setEditing] = useState<AmenityRow | 'new' | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState(maintenance.message)
  const [bannerOn, setBannerOn] = useState(maintenance.on)

  const groups = useMemo(() => {
    const map = new Map<string, AmenityRow[]>()
    for (const a of amenities) map.set(a.group, [...(map.get(a.group) ?? []), a])
    return [...map.entries()]
  }, [amenities])

  const current = (kind: 'terms' | 'privacy') =>
    legal.filter((l) => l.kind === kind).sort((a, b) => b.version.localeCompare(a.version))

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="These apply to every business on PG Manager."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Features for everyone"
          description="Switching one off hides it for all businesses, whatever their plan."
        >
          <div className="divide-y">
            {SWITCHES.map((s) => (
              <Switch
                key={s.key}
                label={s.label}
                description={s.description}
                checked={switches[s.key]}
                onChange={(v) => {
                  updateExtras((x) => {
                    x.switches[s.key] = v
                  })
                  toast.success(
                    `${s.label} ${v ? 'switched on' : 'switched off'} for all businesses`,
                  )
                }}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Maintenance banner"
          description="A message shown at the top of every owner’s app."
        >
          <div className="grid gap-4">
            <Switch label="Show the banner" checked={bannerOn} onChange={setBannerOn} />
            <Field
              label="Message"
              hint={`${message.length}/140 characters`}
              error={message.trim() ? undefined : 'Type the message owners should see.'}
            >
              <Textarea
                maxLength={140}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            {bannerOn && message.trim() && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-[13px] text-amber-950">
                <Megaphone className="size-4 shrink-0" />
                {message}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                disabled={
                  !message.trim() ||
                  (message === maintenance.message && bannerOn === maintenance.on)
                }
                onClick={() => {
                  updateExtras((x) => {
                    x.maintenance = { on: bannerOn, message: message.trim() }
                  })
                  toast.success(
                    bannerOn ? 'Banner is now shown to every owner' : 'Banner saved and hidden',
                  )
                }}
              >
                Save banner
              </Button>
            </div>
          </div>
        </Section>

        <Section
          title="Amenity catalogue"
          description="The only list of amenities owners can pick from. Hidden ones stay on properties that already have them."
          className="lg:col-span-2"
          actions={
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus /> Add amenity
            </Button>
          }
        >
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group}
                </p>
                <ul className="divide-y rounded-lg border">
                  {list.map((a) => (
                    <li key={a.key} className="flex items-center gap-2 px-3 py-2">
                      <span
                        className={
                          a.hidden
                            ? 'flex-1 text-sm text-muted-foreground line-through'
                            : 'flex-1 text-sm'
                        }
                      >
                        {a.name}
                      </span>
                      {a.hidden && <Badge>Hidden</Badge>}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Rename ${a.name}`}
                        onClick={() => setEditing(a)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={a.hidden ? `Show ${a.name}` : `Hide ${a.name}`}
                        onClick={() => {
                          updateExtras((x) => {
                            x.amenities = x.amenities.map((y) =>
                              y.key === a.key ? { ...y, hidden: !y.hidden } : y,
                            )
                          })
                          toast.success(
                            a.hidden
                              ? `${a.name} can be picked again`
                              : `${a.name} hidden from the list`,
                          )
                        }}
                      >
                        {a.hidden ? <Eye /> : <EyeOff />}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Terms and Privacy"
          description="Owners tick the newest version at sign-up. Publishing a new one asks everyone to accept it at next sign-in."
          className="lg:col-span-2"
          actions={
            <Button size="sm" variant="outline" onClick={() => setPublishing(true)}>
              <FileText /> Publish new version
            </Button>
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            {(['terms', 'privacy'] as const).map((k) => (
              <div key={k}>
                <p className="mb-2 text-sm font-semibold">
                  {k === 'terms' ? 'Terms of use' : 'Privacy policy'}
                </p>
                <ol className="grid gap-2">
                  {current(k).map((l, i) => (
                    <li key={l.version} className="rounded-lg border px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">Version {l.version}</span>
                        {i === 0 ? <Badge tone="good">In use</Badge> : <Badge>Older</Badge>}
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{l.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Published {formatDate(l.publishedOn)}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <AmenityDialog
        key={editing === 'new' ? 'new' : (editing?.key ?? 'none')}
        amenity={editing}
        onClose={() => setEditing(null)}
        groups={groups.map(([g]) => g)}
      />
      <PublishDialog open={publishing} onClose={() => setPublishing(false)} />
    </>
  )
}

function AmenityDialog({
  amenity,
  onClose,
  groups,
}: {
  amenity: AmenityRow | 'new' | null
  onClose: () => void
  groups: string[]
}) {
  const all = useExtras((x) => x.amenities)
  const existing = amenity && amenity !== 'new' ? amenity : null
  const [name, setName] = useState(existing?.name ?? '')
  const [group, setGroup] = useState(existing?.group ?? groups[0] ?? 'Basics')
  const [tried, setTried] = useState(false)
  const error = !name.trim()
    ? 'Type the amenity name owners will see.'
    : all.some((a) => a.name.toLowerCase() === name.trim().toLowerCase() && a.key !== existing?.key)
      ? 'This amenity is already in the list.'
      : undefined
  return (
    <Dialog
      open={amenity !== null}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Rename ${existing.name}` : 'Add amenity'}
      description={
        existing
          ? 'The new name shows on every property that has it.'
          : 'Owners can pick it straight away.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (error) return
              updateExtras((x) => {
                if (existing) {
                  x.amenities = x.amenities.map((a) =>
                    a.key === existing.key ? { ...a, name: name.trim(), group } : a,
                  )
                } else {
                  x.amenities = [
                    ...x.amenities,
                    {
                      key: name
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '_'),
                      name: name.trim(),
                      group,
                      hidden: false,
                    },
                  ]
                }
              })
              toast.success(
                existing ? `Renamed to ${name.trim()}` : `${name.trim()} added to the catalogue`,
              )
              onClose()
            }}
          >
            {existing ? 'Save' : 'Add amenity'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" required error={tried ? error : undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example: Badminton court"
          />
        </Field>
        <Field label="Group">
          <NativeSelect value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </Dialog>
  )
}

function PublishDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const legal = useExtras((x) => x.legal)
  const [kind, setKind] = useState<'terms' | 'privacy'>('terms')
  const [summary, setSummary] = useState('')
  const [tried, setTried] = useState(false)
  const latest = legal
    .filter((l) => l.kind === kind)
    .sort((a, b) => b.version.localeCompare(a.version))[0]
  const base = TODAY.slice(0, 7)
  const version =
    latest && latest.version.startsWith(base)
      ? `${base}.${(Number(latest.version.split('.')[1] ?? 1) || 1) + 1}`
      : base
  const error = tried && !summary.trim() ? 'Write in one line what changed.' : undefined
  function close() {
    setSummary('')
    setTried(false)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      variant="side"
      title="Publish a new version"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (!summary.trim()) return
              updateExtras((x) => {
                x.legal = [
                  { kind, version, publishedOn: TODAY, summary: summary.trim() },
                  ...x.legal,
                ]
              })
              toast.success(
                `${kind === 'terms' ? 'Terms' : 'Privacy policy'} version ${version} published`,
              )
              close()
            }}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Document">
          <Segmented
            label="Document"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'terms', label: 'Terms of use' },
              { value: 'privacy', label: 'Privacy policy' },
            ]}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          New version: <span className="font-medium text-foreground">{version}</span>
          {latest && <> (now {latest.version})</>}
        </p>
        <Field label="What changed" required error={error}>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="For example: added the tenant app"
          />
        </Field>
        <Alert tone="warn" title="Everyone accepts again">
          Every owner and team member will be asked to tick the new version the next time they sign
          in. Their earlier acceptance stays on record.
        </Alert>
      </div>
    </Dialog>
  )
}
