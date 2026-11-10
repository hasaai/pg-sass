import {
  ArrowRightLeft,
  BellRing,
  CalendarClock,
  Download,
  FileWarning,
  IndianRupee,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Phone,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import {
  Avatar,
  FilterChips,
  Money,
  PropertyPicker,
  SearchBox,
  Status,
  Toolbar,
} from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { INVOICE_STATUS, TENANT_STATUS, placeLabel, propertyName } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { Invoice, Tenant, TenantStatus } from '../../data/types'
import { useSession } from '../../demo/session'
import { useBreadcrumbs } from '../../shell/crumbs'
import {
  KYC,
  THIS_MONTH,
  csvRupees,
  digits,
  downloadCsv,
  sendReminders,
  telLink,
  waLink,
} from './lib'
import { TenantActionDialogs } from './tenant-dialogs'
import type { TenantAction } from './tenant-dialogs'

type Chip = 'current' | TenantStatus

export function TenantsList() {
  useBreadcrumbs([{ label: 'Tenants' }])
  const { can, person } = useSession()
  const navigate = useNavigate()
  const db = useDb((d) => d)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [chip, setChip] = useState<Chip>('current')
  const [propertyId, setPropertyId] = useState('')
  const [kycPending, setKycPending] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [food, setFood] = useState<'' | 'yes' | 'no'>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<TenantAction>(null)
  const money = can('rent.view')
  const manage = can('tenants.manage')

  const billOf = useMemo(() => {
    const map = new Map<string, Invoice>()
    for (const i of db.invoices)
      if (i.period === THIS_MONTH && !map.has(i.tenantId)) map.set(i.tenantId, i)
    return map
  }, [db.invoices])

  const overdueTenants = useMemo(
    () => new Set(db.invoices.filter((i) => i.status === 'overdue').map((i) => i.tenantId)),
    [db.invoices],
  )

  const base = db.tenants.filter((t) => !propertyId || t.propertyId === propertyId)
  const counts = {
    current: base.filter((t) => t.status !== 'moved_out').length,
    active: base.filter((t) => t.status === 'active').length,
    notice: base.filter((t) => t.status === 'notice').length,
    upcoming: base.filter((t) => t.status === 'upcoming').length,
    moved_out: base.filter((t) => t.status === 'moved_out').length,
  }
  const kycCount = base.filter((t) => t.status !== 'moved_out' && t.kyc !== 'verified').length
  const overdueCount = base.filter(
    (t) => t.status !== 'moved_out' && overdueTenants.has(t.id),
  ).length

  const needle = q.trim().toLowerCase()
  const rows = base
    .filter((t) => (chip === 'current' ? t.status !== 'moved_out' : t.status === chip))
    .filter((t) => !kycPending || t.kyc !== 'verified')
    .filter((t) => !agreementOpen || t.agreement !== 'signed')
    .filter((t) => !food || (food === 'yes' ? t.food : !t.food))
    .filter((t) => {
      if (!needle) return true
      const place = placeLabel(db, t).toLowerCase()
      return (
        t.name.toLowerCase().includes(needle) ||
        digits(t.phone).includes(needle.replace(/\D/g, '') || '#') ||
        place.includes(needle) ||
        place.replace(/\D/g, ' ').split(' ').includes(needle)
      )
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const moreCount = Number(kycPending) + Number(agreementOpen) + Number(!!food)
  const visibleSelected = rows.filter((r) => selected.has(r.id))
  const allChecked = rows.length > 0 && visibleSelected.length === rows.length

  function setQ(v: string) {
    const next = new URLSearchParams(params)
    if (v) next.set('q', v)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function exportCsv(list: Tenant[]) {
    downloadCsv(`tenants-${THIS_MONTH}.csv`, [
      [
        'Name',
        'Mobile',
        'Email',
        'Property',
        'Place',
        'Status',
        ...(money ? ['Rent (₹)', 'Deposit paid (₹)'] : []),
        'Moved in',
        'ID',
      ],
      ...list.map((t) => [
        t.name,
        t.phone,
        t.email,
        propertyName(db, t.propertyId),
        placeLabel(db, t),
        TENANT_STATUS[t.status].label,
        ...(money ? [csvRupees(t.rent), csvRupees(t.depositPaid)] : []),
        t.checkIn,
        KYC[t.kyc].label,
      ]),
    ])
    toast.success(
      `Downloaded ${list.length} ${list.length === 1 ? 'tenant' : 'tenants'} as a spreadsheet`,
    )
  }

  function remind(list: Tenant[]) {
    const ids = list
      .map((t) => billOf.get(t.id))
      .filter((i): i is Invoice => !!i && i.status !== 'paid')
      .map((i) => i.id)
    if (!ids.length) {
      toast.info('All the chosen tenants have paid this month. No reminders needed.')
      return
    }
    const n = sendReminders(ids, 'whatsapp', person.name)
    toast.success(`WhatsApp reminders sent to ${n} ${n === 1 ? 'tenant' : 'tenants'}`, {
      description:
        list.length > n ? `${list.length - n} already paid, so they were skipped.` : undefined,
    })
    setSelected(new Set())
  }

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Everyone staying with you, moving in soon or on notice."
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(rows)}>
              <Download /> Export
            </Button>
            {manage && (
              <Button asChild>
                <Link to="/app/tenants/new">
                  <UserPlus /> Add tenant
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Staying"
          value={counts.active + counts.notice}
          icon={<Users />}
          hint={`${counts.notice} of them on notice`}
        />
        <StatCard
          label="On notice"
          value={counts.notice}
          icon={<LogOut />}
          hint="Beds becoming free"
        />
        <StatCard
          label="Moving in soon"
          value={counts.upcoming}
          icon={<CalendarClock />}
          hint="Bed reserved"
        />
        <StatCard
          label="ID pending"
          value={kycCount}
          icon={<FileWarning />}
          hint="ID not checked yet"
        />
        {money && (
          <StatCard
            label="Rent overdue"
            value={overdueCount}
            icon={<IndianRupee />}
            hint={
              <Link to="/app/rent?status=overdue" className="text-primary hover:underline">
                See overdue bills
              </Link>
            }
          />
        )}
      </div>

      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search by name, phone or room"
          className="max-w-sm"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal /> More filters
              {moreCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                  {moreCount}
                </span>
              )}
            </Button>
          </MenuTrigger>
          <MenuContent className="w-56">
            <MenuCheckItem checked={kycPending} onCheckedChange={(v) => setKycPending(v === true)}>
              ID not checked yet
            </MenuCheckItem>
            <MenuCheckItem
              checked={agreementOpen}
              onCheckedChange={(v) => setAgreementOpen(v === true)}
            >
              Agreement not signed
            </MenuCheckItem>
            <MenuSeparator />
            <MenuLabel>Food</MenuLabel>
            <MenuCheckItem
              checked={food === 'yes'}
              onCheckedChange={(v) => setFood(v ? 'yes' : '')}
            >
              Takes food
            </MenuCheckItem>
            <MenuCheckItem checked={food === 'no'} onCheckedChange={(v) => setFood(v ? 'no' : '')}>
              No food
            </MenuCheckItem>
            {moreCount > 0 && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<X />}
                  onSelect={() => {
                    setKycPending(false)
                    setAgreementOpen(false)
                    setFood('')
                  }}
                >
                  Clear these filters
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </Toolbar>
      <div className="mb-4">
        <FilterChips
          label="Tenant status"
          value={chip}
          onChange={setChip}
          options={[
            { value: 'current', label: 'All current', count: counts.current },
            { value: 'active', label: 'Staying', count: counts.active },
            { value: 'notice', label: 'On notice', count: counts.notice },
            { value: 'upcoming', label: 'Moving in soon', count: counts.upcoming },
            { value: 'moved_out', label: 'Moved out', count: counts.moved_out },
          ]}
        />
      </div>

      {visibleSelected.length > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2">
          <span className="text-sm font-medium">{visibleSelected.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {can('rent.collect') && (
              <Button size="sm" variant="outline" onClick={() => remind(visibleSelected)}>
                <BellRing /> Send reminder
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => exportCsv(visibleSelected)}>
              <Download /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={needle ? `No tenant matches “${q}”` : 'No tenants here'}
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setQ('')
                  setChip('current')
                  setPropertyId('')
                  setKycPending(false)
                  setAgreementOpen(false)
                  setFood('')
                }}
              >
                Clear filters
              </Button>
              {manage && (
                <Button asChild>
                  <Link to="/app/tenants/new">Add tenant</Link>
                </Button>
              )}
            </>
          }
        >
          Try another name, phone or room number, or change the filters.
        </EmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">
                    <Checkbox
                      aria-label="Select all"
                      checked={allChecked ? true : visibleSelected.length ? 'indeterminate' : false}
                      onCheckedChange={() =>
                        setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))
                      }
                    />
                  </TH>
                  <TH>Tenant</TH>
                  <TH>Place</TH>
                  {money && <TH className="text-right">Rent</TH>}
                  {money && <TH>This month</TH>}
                  <TH>ID</TH>
                  <TH>Status</TH>
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {rows.map((t) => {
                  const bill = billOf.get(t.id)
                  return (
                    <TR
                      key={t.id}
                      data-state={selected.has(t.id) ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => navigate(`/app/tenants/${t.id}`)}
                    >
                      <TD onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${t.name}`}
                          checked={selected.has(t.id)}
                          onCheckedChange={() => toggle(t.id)}
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={t.name} hue={t.photoHue} />
                          <div className="min-w-0">
                            <Link
                              to={`/app/tenants/${t.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium hover:underline"
                            >
                              {t.name}
                            </Link>
                            <p className="text-xs text-muted-foreground tabular-nums">{t.phone}</p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <p className="text-sm">{placeLabel(db, t)}</p>
                        <p className="text-xs text-muted-foreground">
                          {propertyName(db, t.propertyId)}
                        </p>
                      </TD>
                      {money && (
                        <TD className="text-right">
                          <Money value={t.rent} />
                        </TD>
                      )}
                      {money && (
                        <TD>
                          {bill ? (
                            <Status of={INVOICE_STATUS} value={bill.status} />
                          ) : (
                            <span className="text-xs text-muted-foreground">No bill</span>
                          )}
                        </TD>
                      )}
                      <TD>
                        <Status of={KYC} value={t.kyc} />
                      </TD>
                      <TD>
                        <Status of={TENANT_STATUS} value={t.status} />
                      </TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <RowMenu t={t} onAction={setAction} />
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>

          <div className="grid gap-2 md:hidden">
            {rows.map((t) => {
              const bill = billOf.get(t.id)
              return (
                <div
                  key={t.id}
                  className="flex gap-3 rounded-xl border bg-card p-3 shadow-xs"
                  onClick={() => navigate(`/app/tenants/${t.id}`)}
                >
                  <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${t.name}`}
                      checked={selected.has(t.id)}
                      onCheckedChange={() => toggle(t.id)}
                    />
                  </div>
                  <Avatar name={t.name} hue={t.photoHue} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {placeLabel(db, t)} · {propertyName(db, t.propertyId)}
                        </p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <RowMenu t={t} onAction={setAction} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Status of={TENANT_STATUS} value={t.status} />
                      {money && bill && <Status of={INVOICE_STATUS} value={bill.status} />}
                      {t.kyc !== 'verified' && <Status of={KYC} value={t.kyc} />}
                      {money && <Money value={t.rent} className="ml-auto text-sm font-medium" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {rows.length} of {counts.current + counts.moved_out} tenants
          </p>
        </>
      )}

      <TenantActionDialogs action={action} onClose={() => setAction(null)} />
    </div>
  )
}

function RowMenu({ t, onAction }: { t: Tenant; onAction: (a: TenantAction) => void }) {
  const { can } = useSession()
  const manage = can('tenants.manage')
  const live = t.status !== 'moved_out'
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {can('rent.collect') && (
          <MenuItem
            icon={<IndianRupee />}
            onSelect={() => onAction({ kind: 'pay', tenantId: t.id })}
          >
            Record payment
          </MenuItem>
        )}
        {manage && live && (
          <MenuItem
            icon={<ArrowRightLeft />}
            onSelect={() => onAction({ kind: 'move', tenantId: t.id })}
          >
            Move to another bed
          </MenuItem>
        )}
        {manage && t.status === 'active' && (
          <MenuItem
            icon={<CalendarClock />}
            onSelect={() => onAction({ kind: 'notice', tenantId: t.id })}
          >
            Give notice
          </MenuItem>
        )}
        {manage && t.status === 'notice' && (
          <MenuItem
            icon={<CalendarClock />}
            onSelect={() => onAction({ kind: 'cancel_notice', tenantId: t.id })}
          >
            Cancel notice
          </MenuItem>
        )}
        {manage && t.status === 'upcoming' && (
          <MenuItem
            icon={<UserPlus />}
            onSelect={() => onAction({ kind: 'movein', tenantId: t.id })}
          >
            Mark as moved in
          </MenuItem>
        )}
        {manage && (t.status === 'active' || t.status === 'notice') && (
          <MenuItem
            icon={<LogOut />}
            destructive
            onSelect={() => onAction({ kind: 'checkout', tenantId: t.id })}
          >
            Check out
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem asChild>
          <a href={telLink(t.phone)}>
            <Phone /> Call {t.phone}
          </a>
        </MenuItem>
        <MenuItem asChild>
          <a href={waLink(t.phone)} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
