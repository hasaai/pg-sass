/** Expenses: what each property spends, month by month. */
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  MoreHorizontal,
  Paperclip,
  Pencil,
  PieChart,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  Money,
  NoAccess,
  PropertyPicker,
  SearchBox,
  Section,
  Switch,
  Toolbar,
} from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { Tooltip } from '../../components/ui-kit/tooltip'
import { THIS_MONTH, TODAY } from '../../data/seed'
import { EXPENSE_CATEGORY, PAY_MODE } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Expense, PayMode } from '../../data/types'
import { useSession } from '../../demo/session'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
  shiftPeriod,
} from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { BarRow, KpiRow, UploadTile } from './shared'
import { csvRupees, downloadCsv, ordinal } from './helpers'

type Category = Expense['category']
const CATEGORIES = Object.keys(EXPENSE_CATEGORY) as Category[]

export function ExpensesPage() {
  useBreadcrumbs([{ label: 'Expenses' }])
  const { can } = useSession()
  const expenses = useDb((db) => db.expenses)
  const properties = useDb((db) => db.properties)
  const [period, setPeriod] = useState(THIS_MONTH)
  const [propertyId, setPropertyId] = useState('')
  const [category, setCategory] = useState<'' | Category>('')
  const [mode, setMode] = useState<'' | PayMode>('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const manage = can('expenses.manage')

  const inProperty = useMemo(
    () => expenses.filter((e) => !propertyId || e.propertyId === propertyId),
    [expenses, propertyId],
  )
  const month = inProperty.filter((e) => e.date.startsWith(period))
  const prev = inProperty.filter((e) => e.date.startsWith(shiftPeriod(period, -1)))
  const total = month.reduce((s, e) => s + e.amount, 0)
  const prevTotal = prev.reduce((s, e) => s + e.amount, 0)
  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0
  const byCategory = CATEGORIES.map((c) => ({
    c,
    amount: month.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
  }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const missing = month.filter((e) => !e.hasBill).length

  const rows = month
    .filter((e) => !category || e.category === category)
    .filter((e) => !mode || e.mode === mode)
    .filter((e) => {
      const q = query.trim().toLowerCase()
      return !q || `${e.description} ${e.vendor}`.toLowerCase().includes(q)
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  const rowsTotal = rows.reduce((s, e) => s + e.amount, 0)

  if (!can('expenses.view')) return <NoAccess what="expenses" />
  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? '—'

  function exportCsv() {
    downloadCsv(`expenses-${period}.csv`, [
      [
        'Date',
        'Category',
        'Description',
        'Vendor',
        'Property',
        'Amount (₹)',
        'Paid by',
        'Bill attached',
      ],
      ...rows.map((e) => [
        e.date,
        EXPENSE_CATEGORY[e.category],
        e.description,
        e.vendor,
        propName(e.propertyId),
        csvRupees(e.amount),
        PAY_MODE[e.mode],
        e.hasBill ? 'Yes' : 'No',
      ]),
    ])
    toast.success(`Downloaded ${rows.length} expenses for ${formatMonth(period)}`)
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Bills, groceries, salaries and repairs for each property."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download /> Export CSV
            </Button>
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Add expense
              </Button>
            )}
          </>
        }
      />

      <Toolbar>
        <div className="flex items-center rounded-lg border bg-card shadow-xs">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => setPeriod((p) => shiftPeriod(p, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{formatMonth(period)}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={period >= THIS_MONTH}
            onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>

      <KpiRow>
        <StatCard
          label={period === THIS_MONTH ? 'Total this month' : `Total in ${formatMonth(period)}`}
          value={<Money value={total} />}
          icon={<Wallet />}
          hint={`${month.length} expenses`}
        />
        <StatCard
          label="Compared to last month"
          value={
            prevTotal ? (
              <span className={change > 0 ? 'text-red-600' : 'text-emerald-600'}>
                {change > 0 ? '+' : ''}
                {change}%
              </span>
            ) : (
              '—'
            )
          }
          icon={change > 0 ? <TrendingUp /> : <TrendingDown />}
          hint={`${formatMonth(shiftPeriod(period, -1))}: ${formatMoney(prevTotal)}${period === THIS_MONTH ? ' · this month is not over yet' : ''}`}
        />
        <StatCard
          label="Biggest category"
          value={byCategory[0] ? EXPENSE_CATEGORY[byCategory[0].c] : '—'}
          icon={<PieChart />}
          hint={
            byCategory[0]
              ? `${formatMoney(byCategory[0].amount)} · ${Math.round((byCategory[0].amount / total) * 100)}% of total`
              : 'Nothing spent yet'
          }
        />
        <StatCard
          label="Bills missing"
          value={<span className={missing ? 'text-amber-600' : ''}>{missing}</span>}
          icon={<FileWarning />}
          hint={missing ? 'Attach bills for GST and records' : 'Every expense has a bill'}
        />
      </KpiRow>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Where the money went" className="lg:order-2" bodyClassName="grid gap-4">
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses this month yet.</p>
          ) : (
            byCategory.map((x) => (
              <BarRow
                key={x.c}
                label={EXPENSE_CATEGORY[x.c]}
                value={x.amount}
                max={byCategory[0]!.amount}
                display={formatMoney(x.amount)}
              />
            ))
          )}
        </Section>

        <div className="min-w-0 lg:col-span-2">
          <Toolbar>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search description or vendor"
            />
            <NativeSelect
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | '')}
              className="h-9 w-auto"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY[c]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Paid by"
              value={mode}
              onChange={(e) => setMode(e.target.value as PayMode | '')}
              className="h-9 w-auto"
            >
              <option value="">Any payment mode</option>
              {(Object.keys(PAY_MODE) as PayMode[]).map((m) => (
                <option key={m} value={m}>
                  {PAY_MODE[m]}
                </option>
              ))}
            </NativeSelect>
          </Toolbar>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title="No expenses match"
              actions={
                manage && (
                  <Button variant="outline" onClick={() => setEditing('new')}>
                    <Plus /> Add expense
                  </Button>
                )
              }
            >
              Try another month, category or search word.
            </EmptyState>
          ) : (
            <div className="rounded-xl border bg-card shadow-xs">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Expense</TH>
                    <TH>Property</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Paid by</TH>
                    <TH>Bill</TH>
                    {manage && <TH className="w-10" />}
                  </TR>
                </THead>
                <TBody>
                  {rows.map((e) => (
                    <TR
                      key={e.id}
                      className={manage ? 'cursor-pointer' : undefined}
                      onClick={() => manage && setEditing(e)}
                    >
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDate(e.date)}
                      </TD>
                      <TD>
                        <p className="font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {EXPENSE_CATEGORY[e.category]} · {e.vendor}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap">{propName(e.propertyId)}</TD>
                      <TD className="text-right font-medium whitespace-nowrap">
                        <Money value={e.amount} />
                      </TD>
                      <TD className="whitespace-nowrap">{PAY_MODE[e.mode]}</TD>
                      <TD>
                        {e.hasBill ? (
                          <Tooltip content="Bill attached">
                            <Paperclip
                              className="size-4 text-emerald-600"
                              aria-label="Bill attached"
                            />
                          </Tooltip>
                        ) : (
                          <Tooltip content="No bill attached">
                            <FileWarning className="size-4 text-amber-500" aria-label="No bill" />
                          </Tooltip>
                        )}
                      </TD>
                      {manage && (
                        <TD onClick={(ev) => ev.stopPropagation()}>
                          <Menu>
                            <MenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`More for ${e.description}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </MenuTrigger>
                            <MenuContent>
                              <MenuItem icon={<Pencil />} onSelect={() => setEditing(e)}>
                                Edit
                              </MenuItem>
                              {!e.hasBill && (
                                <MenuItem
                                  icon={<Paperclip />}
                                  onSelect={() => {
                                    updateDb((d) => {
                                      const x = d.expenses.find((y) => y.id === e.id)
                                      if (x) x.hasBill = true
                                    })
                                    toast.success('Bill attached')
                                  }}
                                >
                                  Attach bill
                                </MenuItem>
                              )}
                              <MenuSeparator />
                              <MenuItem
                                destructive
                                icon={<Trash2 />}
                                onSelect={() => setDeleting(e)}
                              >
                                Delete
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="flex justify-between border-t px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{rows.length} expenses</span>
                <span className="font-semibold">
                  Total <Money value={rowsTotal} />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ExpenseDialog
          expense={editing === 'new' ? undefined : editing}
          defaultProperty={propertyId}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this expense?"
        confirmLabel="Delete expense"
        destructive
        onConfirm={() => {
          if (!deleting) return
          updateDb((d) => {
            d.expenses = d.expenses.filter((x) => x.id !== deleting.id)
            logActivity(d, {
              kind: 'expense',
              action: `Deleted an expense of ${formatMoney(deleting.amount)}`,
              target: deleting.description,
              propertyId: deleting.propertyId,
            })
          })
          toast.success('Expense deleted')
          setDeleting(null)
        }}
      >
        <p>
          {deleting?.description} ({formatMoney(deleting?.amount)}) will be removed from expenses
          and profit reports.
        </p>
      </ConfirmDialog>
    </>
  )
}

function ExpenseDialog({
  expense,
  defaultProperty,
  onClose,
}: {
  expense?: Expense
  defaultProperty: string
  onClose: () => void
}) {
  const { person } = useSession()
  const properties = useDb((db) => db.properties)
  const [form, setForm] = useState({
    date: expense?.date ?? TODAY,
    propertyId: expense?.propertyId ?? (defaultProperty || 'p1'),
    category: expense?.category ?? ('groceries' as Category),
    amount: expense ? paiseToRupeesInput(expense.amount) : '',
    description: expense?.description ?? '',
    vendor: expense?.vendor ?? '',
    mode: expense?.mode ?? ('upi' as PayMode),
    hasBill: expense?.hasBill ?? false,
    repeat: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function save() {
    const e: Record<string, string> = {}
    const amount = rupeesToPaise(form.amount)
    if (amount === null || amount <= 0) e.amount = 'Type the amount in rupees, e.g. 2,450.'
    if (!form.description.trim()) e.description = 'Say what it was for, e.g. “BESCOM bill”.'
    if (!form.date) e.date = 'Choose the date it was paid.'
    if (form.date > TODAY) e.date = 'The date cannot be in the future.'
    setErrors(e)
    if (Object.keys(e).length || amount === null) return
    const data = {
      date: form.date,
      propertyId: form.propertyId,
      category: form.category,
      amount,
      description: form.description.trim(),
      vendor: form.vendor.trim() || '—',
      mode: form.mode,
      hasBill: form.hasBill,
    }
    updateDb((d) => {
      if (expense) {
        const x = d.expenses.find((y) => y.id === expense.id)
        if (x) Object.assign(x, data)
      } else {
        d.expenses.unshift({ id: newId('e'), ...data })
      }
      logActivity(d, {
        by: person.name,
        kind: 'expense',
        action: expense
          ? `Changed an expense to ${formatMoney(amount)}`
          : `Added an expense of ${formatMoney(amount)}`,
        target: data.description,
        propertyId: data.propertyId,
      })
    })
    toast.success(
      expense
        ? 'Expense updated'
        : form.repeat
          ? `Expense added. It will be added again on the ${ordinal(Number(form.date.slice(8)))} of every month.`
          : 'Expense added',
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={expense ? 'Edit expense' : 'Add expense'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{expense ? 'Save changes' : 'Add expense'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date paid" required error={errors.date}>
            <Input
              type="date"
              value={form.date}
              max={TODAY}
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>
          <Field label="Property">
            <NativeSelect
              value={form.propertyId}
              onChange={(e) => set('propertyId', e.target.value)}
            >
              {properties
                .filter((p) => p.status !== 'archived')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Category">
            <NativeSelect
              value={form.category}
              onChange={(e) => set('category', e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Amount (₹)" required error={errors.amount}>
            <Input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="e.g. 2450"
            />
          </Field>
        </div>
        <Field label="What was it for?" required error={errors.description}>
          <Input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. BESCOM electricity bill"
          />
        </Field>
        <Field label="Paid to (shop or person)">
          <Input
            value={form.vendor}
            onChange={(e) => set('vendor', e.target.value)}
            placeholder="e.g. Metro Cash & Carry"
          />
        </Field>
        <Field label="Paid by">
          <NativeSelect value={form.mode} onChange={(e) => set('mode', e.target.value as PayMode)}>
            {(Object.keys(PAY_MODE) as PayMode[]).map((m) => (
              <option key={m} value={m}>
                {PAY_MODE[m]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Bill or receipt">
          <UploadTile
            icon={<Paperclip />}
            label="Attach a photo of the bill"
            doneLabel="bill-photo.jpg attached"
            done={form.hasBill}
            onClick={() => set('hasBill', !form.hasBill)}
          />
        </Field>
        {!expense && (
          <div className="rounded-lg border px-3">
            <Switch
              checked={form.repeat}
              onChange={(v) => set('repeat', v)}
              label="Repeats every month"
              description="For building rent, internet and salaries. We add it on the same date each month."
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}
