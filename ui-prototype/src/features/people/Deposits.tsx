import { Landmark, MoreHorizontal, PiggyBank, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import {
  Avatar,
  FilterChips,
  Money,
  PropertyPicker,
  SearchBox,
  Toolbar,
} from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { placeLabel, propertyName } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { Tenant } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatDate, formatMoney } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { DepositDialog } from './deposit-dialogs'
import type { DepositAction } from './deposit-dialogs'
import { NoAccessGuard } from './guards'
import { THIS_MONTH } from './lib'

type Chip = 'all' | 'pending' | 'refund' | 'paid'

function depositState(t: Tenant): { label: string; tone: 'good' | 'warn' | 'bad' | 'info' } {
  if (t.status === 'notice') return { label: `Refund on ${formatDate(t.moveOutOn)}`, tone: 'info' }
  if (t.depositPaid >= t.deposit) return { label: 'Fully paid', tone: 'good' }
  if (t.depositPaid > 0) return { label: 'Part paid', tone: 'warn' }
  return { label: 'Not paid', tone: 'bad' }
}

export function DepositsPage() {
  return (
    <NoAccessGuard perm="rent.view" what="deposits">
      <Deposits />
    </NoAccessGuard>
  )
}

function Deposits() {
  useBreadcrumbs([{ label: 'Rent & bills', to: '/app/rent' }, { label: 'Deposits' }])
  const { can } = useSession()
  const navigate = useNavigate()
  const db = useDb((d) => d)
  const [chip, setChip] = useState<Chip>('all')
  const [propertyId, setPropertyId] = useState('')
  const [q, setQ] = useState('')
  const [action, setAction] = useState<DepositAction>(null)
  const collect = can('rent.collect')

  const base = db.tenants.filter(
    (t) =>
      (t.status !== 'moved_out' || t.depositPaid > 0) &&
      (!propertyId || t.propertyId === propertyId),
  )
  const held = base.reduce((s, t) => s + t.depositPaid, 0)
  const pendingList = base.filter(
    (t) => t.status !== 'moved_out' && t.depositPaid < t.deposit && t.status !== 'notice',
  )
  const refundList = base.filter(
    (t) => t.status === 'notice' || (t.status === 'moved_out' && t.depositPaid > 0),
  )
  const refundThisMonth = refundList.filter((t) => (t.moveOutOn ?? '').slice(0, 7) <= THIS_MONTH)
  const paidList = base.filter((t) => t.depositPaid >= t.deposit && t.status !== 'notice')
  const needle = q.trim().toLowerCase()
  const rows = (
    chip === 'all'
      ? base
      : chip === 'pending'
        ? pendingList
        : chip === 'refund'
          ? refundList
          : paidList
  )
    .filter(
      (t) =>
        !needle ||
        t.name.toLowerCase().includes(needle) ||
        placeLabel(db, t).toLowerCase().includes(needle),
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <PageHeader
        title="Deposits"
        description="Security deposits you hold, still to collect and to return."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total held"
          value={formatMoney(held)}
          icon={<PiggyBank />}
          hint={`From ${base.filter((t) => t.depositPaid > 0).length} tenants`}
        />
        <StatCard
          label="Still to collect"
          value={formatMoney(pendingList.reduce((s, t) => s + t.deposit - t.depositPaid, 0))}
          icon={<Wallet />}
          hint={`${pendingList.length} tenants`}
        />
        <StatCard
          label="To refund this month"
          value={formatMoney(refundThisMonth.reduce((s, t) => s + t.depositPaid, 0))}
          icon={<Undo2 />}
          hint={`${refundThisMonth.length} moving out`}
        />
        <StatCard
          label="Fully paid"
          value={paidList.length}
          icon={<Landmark />}
          hint={`of ${base.length} tenants`}
        />
      </div>

      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search tenant or room"
          className="max-w-sm"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>
      <div className="mb-4">
        <FilterChips
          label="Deposit status"
          value={chip}
          onChange={setChip}
          options={[
            { value: 'all', label: 'All', count: base.length },
            { value: 'pending', label: 'Still to collect', count: pendingList.length },
            { value: 'refund', label: 'To refund', count: refundList.length },
            { value: 'paid', label: 'Fully paid', count: paidList.length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<PiggyBank />} title="No deposits here">
          Try another filter or property.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <THead>
              <tr>
                <TH>Tenant</TH>
                <TH className="text-right">Deposit</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Still to pay</TH>
                <TH>Status</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {rows.map((t) => {
                const st = depositState(t)
                const pending = Math.max(0, t.deposit - t.depositPaid)
                return (
                  <TR
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/tenants/${t.id}`)}
                  >
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} hue={t.photoHue} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium whitespace-nowrap">{t.name}</p>
                          <p className="text-xs whitespace-nowrap text-muted-foreground">
                            {placeLabel(db, t)} · {propertyName(db, t.propertyId)}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Money value={t.deposit} />
                    </TD>
                    <TD className="text-right">
                      <Money value={t.depositPaid} />
                    </TD>
                    <TD className="text-right font-semibold">
                      {pending > 0 && t.status !== 'moved_out' ? (
                        <Money value={pending} className="text-red-700" />
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      {collect && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Deposit actions for ${t.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            {pending > 0 && t.status !== 'moved_out' && (
                              <MenuItem
                                icon={<Wallet />}
                                onSelect={() => setAction({ kind: 'collect', tenantId: t.id })}
                              >
                                Record deposit payment
                              </MenuItem>
                            )}
                            <MenuItem
                              icon={<Undo2 />}
                              disabled={t.depositPaid <= 0}
                              onSelect={() => setAction({ kind: 'refund', tenantId: t.id })}
                            >
                              Refund deposit
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}
      <DepositDialog action={action} onClose={() => setAction(null)} />
    </div>
  )
}
