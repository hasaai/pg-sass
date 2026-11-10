import {
  CalendarCheck,
  CircleAlert,
  IndianRupee,
  MoreHorizontal,
  Pencil,
  Plus,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { api } from '../../api/client'
import { useApi, useApiMutation, useList } from '../../api/hooks'
import type { Employee, FinanceSummary, Property } from '../../api/types'
import { Checkbox, ErrorBanner, PeriodSwitcher, SelectField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardHeader } from '../../components/ui-kit/card'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { cn } from '../../lib/cn'
import {
  currentPeriod,
  formatMoney,
  formatMonth,
  initials,
  paiseToRupeesInput,
  rupeesToPaise,
  todayISO,
} from '../../lib/format'
import { PAYMENT_MODES } from '../../lib/options'
import { useForm } from '../../lib/useForm'

const INVALIDATE = ['/employees/', '/expenses/', '/reports/']
const FIELDS = [
  'full_name',
  'phone',
  'role_title',
  'property',
  'monthly_salary',
  'pay_day',
  'joined_on',
]

function EmployeeForm({
  formId,
  employee,
  properties,
  busyChange,
  onDone,
}: {
  formId: string
  employee?: Employee
  properties: Property[]
  busyChange: (busy: boolean) => void
  onDone: () => void
}) {
  const form = useForm({
    full_name: employee?.full_name ?? '',
    phone: employee?.phone ?? '',
    role_title: employee?.role_title ?? '',
    property: employee?.property ?? '',
    monthly_salary: employee ? paiseToRupeesInput(employee.monthly_salary) : '',
    pay_day: String(employee?.pay_day ?? 1),
    joined_on: employee?.joined_on ?? '',
    is_active: employee?.is_active ?? true,
  })
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      employee ? api.patch(`/employees/${employee.id}/`, body) : api.post('/employees/', body),
    INVALIDATE,
    () => {
      toast.success(employee ? 'Staff member saved' : 'Staff member added')
      onDone()
    },
  )
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const salary = rupeesToPaise(form.values.monthly_salary)
    if (salary === null) {
      form.setError(new Error('Monthly salary: enter rupees, e.g. 18000.'))
      return
    }
    busyChange(true)
    save.mutate(
      {
        ...form.values,
        monthly_salary: salary,
        pay_day: Number(form.values.pay_day),
        property: form.values.property || null,
        joined_on: form.values.joined_on || null,
      },
      { onError: form.setError, onSettled: () => busyChange(false) },
    )
  }
  return (
    <form id={formId} onSubmit={onSubmit} noValidate>
      <ErrorBanner error={form.error} fields={FIELDS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Name"
            required
            error={form.fieldError('full_name')}
            {...form.bind('full_name')}
          />
        </div>
        <TextField
          label="Job"
          required
          placeholder="Cook, warden, housekeeping…"
          error={form.fieldError('role_title')}
          {...form.bind('role_title')}
        />
        <TextField
          label="Mobile"
          type="tel"
          error={form.fieldError('phone')}
          {...form.bind('phone')}
        />
        <div className="sm:col-span-2">
          <SelectField
            label="Works at"
            placeholder="All properties"
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            error={form.fieldError('property')}
            {...form.bind('property')}
          />
        </div>
        <TextField
          label="Monthly salary (₹)"
          inputMode="decimal"
          required
          placeholder="e.g. 18000"
          className="tabular-nums"
          error={form.fieldError('monthly_salary')}
          {...form.bind('monthly_salary')}
        />
        <TextField
          label="Pay day (1–28)"
          type="number"
          min={1}
          max={28}
          error={form.fieldError('pay_day')}
          {...form.bind('pay_day')}
        />
        <TextField
          label="Joined on"
          type="date"
          error={form.fieldError('joined_on')}
          {...form.bind('joined_on')}
        />
        {employee && (
          <div className="sm:col-span-2">
            <Checkbox
              label="Still working here"
              className="rounded-lg border bg-secondary/40 px-3 py-2.5"
              {...form.bindCheck('is_active')}
            />
          </div>
        )}
      </div>
    </form>
  )
}

function PayForm({
  formId,
  employee,
  period,
  busyChange,
  onDone,
}: {
  formId: string
  employee: Employee
  period: string
  busyChange: (busy: boolean) => void
  onDone: () => void
}) {
  const form = useForm({
    amount: paiseToRupeesInput(employee.monthly_salary),
    paid_on: todayISO(),
    mode: 'upi',
    reference: '',
  })
  const pay = useApiMutation(
    (body: Record<string, unknown>) => api.post(`/employees/${employee.id}/pay/`, body),
    INVALIDATE,
    () => {
      toast.success(`Salary paid to ${employee.full_name}`)
      onDone()
    },
  )
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = rupeesToPaise(form.values.amount)
    if (amount === null) {
      form.setError(new Error('Amount: enter rupees.'))
      return
    }
    busyChange(true)
    pay.mutate(
      { ...form.values, amount, month: period },
      { onError: form.setError, onSettled: () => busyChange(false) },
    )
  }
  return (
    <form id={formId} onSubmit={onSubmit} noValidate>
      <div className="mb-5 flex items-center gap-3 rounded-xl border bg-secondary/40 px-4 py-3">
        <Avatar name={employee.full_name} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13.5px] font-medium">{employee.full_name}</p>
          <p className="m-0 truncate text-xs text-muted-foreground">{employee.role_title}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-xs text-muted-foreground">Monthly salary</p>
          <p className="m-0 text-[13.5px] font-semibold tabular-nums">
            {formatMoney(employee.monthly_salary)}
          </p>
        </div>
      </div>
      <ErrorBanner
        error={form.error}
        fields={['amount', 'paid_on', 'mode', 'reference', 'month']}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Amount (₹)"
          inputMode="decimal"
          className="tabular-nums"
          error={form.fieldError('amount')}
          {...form.bind('amount')}
        />
        <TextField
          label="Paid on"
          type="date"
          max={todayISO()}
          error={form.fieldError('paid_on')}
          {...form.bind('paid_on')}
        />
        <SelectField label="Paid by" options={PAYMENT_MODES} {...form.bind('mode')} />
        <TextField
          label="Reference"
          error={form.fieldError('reference')}
          {...form.bind('reference')}
        />
      </div>
    </form>
  )
}

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        muted
          ? 'bg-secondary text-muted-foreground'
          : 'bg-gradient-to-b from-primary-soft to-[oklch(0.92_0.04_175)] text-accent-foreground ring-1 ring-primary/10',
      )}
    >
      {initials(name) || <UserRound className="size-4" />}
    </span>
  )
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: 'good' | 'warn'
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          aria-hidden
          className={cn(
            'flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5',
            tone === 'good'
              ? 'bg-emerald-50 text-emerald-600'
              : tone === 'warn'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'm-0 mt-3 truncate text-[22px] leading-none sm:text-[26px] font-semibold tracking-[-0.025em] tabular-nums',
        )}
      >
        {value}
      </p>
      {hint && <p className="m-0 mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SalaryStatus({ employee, due }: { employee: Employee; due: boolean }) {
  if (!employee.is_active) return <Badge tone="neutral">Left</Badge>
  return due ? (
    <Badge tone="bad" dot>
      Not paid
    </Badge>
  ) : (
    <Badge tone="good" dot>
      Paid
    </Badge>
  )
}

function RowMenu({
  employee,
  canPay,
  onEdit,
  onPay,
}: {
  employee: Employee
  canPay: boolean
  onEdit: () => void
  onPay: () => void
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${employee.full_name}`}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {canPay && (
          <MenuItem icon={<IndianRupee />} onSelect={onPay}>
            Pay salary
          </MenuItem>
        )}
        <MenuItem icon={<Pencil />} onSelect={onEdit}>
          Edit
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

type Dialog = { kind: 'new' } | { kind: 'edit' | 'pay'; employee: Employee } | null

export function StaffPage() {
  const [period, setPeriod] = useState(currentPeriod())
  const [dialog, setDialog] = useState<Dialog>(null)
  const [saving, setSaving] = useState(false)
  const employees = useList<Employee>('/employees/')
  const properties = useList<Property>('/properties/')
  const summary = useApi<FinanceSummary>('/reports/finance', { period })
  const due = new Set((summary.data?.salaries_due ?? []).map((s) => s.employee_id))
  const active = employees.rows.filter((e) => e.is_active)
  const payroll = active.reduce((sum, e) => sum + e.monthly_salary, 0)
  const unpaid = active.filter((e) => due.has(e.id))
  const unpaidTotal = unpaid.reduce((sum, e) => sum + e.monthly_salary, 0)
  const month = formatMonth(period)
  const close = () => setDialog(null)
  const title =
    dialog?.kind === 'pay'
      ? 'Pay salary'
      : dialog?.kind === 'edit'
        ? 'Edit staff member'
        : 'Add staff member'
  const formId = 'staff-form'

  return (
    <>
      <PageHeader
        title="Staff & salaries"
        description={`Monthly payroll ${formatMoney(payroll)} for ${active.length} people.`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="flex-1 sm:flex-none [&>span]:flex [&>span]:w-full [&>span>span]:flex-1 sm:[&>span]:inline-flex">
              <PeriodSwitcher period={period} onChange={setPeriod} />
            </div>
            <Button onClick={() => setDialog({ kind: 'new' })}>
              <Plus />
              Add staff member
            </Button>
          </div>
        }
      />
      <ErrorBanner error={employees.error ?? summary.error} />

      <div className="grid gap-5">
        {employees.isLoading ? (
          <div className="grid gap-5" role="status" aria-label="Loading">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[106px] rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-[320px] rounded-xl" />
          </div>
        ) : employees.rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No staff added yet."
            actions={
              <Button variant="outline" onClick={() => setDialog({ kind: 'new' })}>
                <Plus />
                Add your first staff member
              </Button>
            }
          >
            Add your cook, warden and housekeeping staff to track salaries with your expenses.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                label="Monthly payroll"
                value={formatMoney(payroll)}
                hint="Salaries of everyone working now"
                icon={<Wallet />}
              />
              <Kpi
                label="Working now"
                value={active.length}
                hint={
                  employees.rows.length > active.length
                    ? `${employees.rows.length - active.length} have left`
                    : 'Everyone on the list'
                }
                icon={<Users />}
              />
              <Kpi
                label="Salaries paid"
                value={
                  summary.isLoading ? '—' : `${active.length - unpaid.length} of ${active.length}`
                }
                hint={`For ${month}`}
                icon={<CalendarCheck />}
                tone={!summary.isLoading && unpaid.length === 0 ? 'good' : undefined}
              />
              <Kpi
                label="Still to pay"
                value={summary.isLoading ? '—' : formatMoney(unpaidTotal)}
                hint={
                  unpaid.length === 0
                    ? 'Nothing due'
                    : `${unpaid.length} ${unpaid.length === 1 ? 'person' : 'people'} not paid yet`
                }
                icon={<CircleAlert />}
                tone={unpaid.length > 0 ? 'warn' : undefined}
              />
            </div>

            <Card>
              <CardHeader title="Staff" description={`Salary status for ${month}`} />
              <div className="hidden border-t md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Works at</TH>
                      <TH className="text-right">Salary</TH>
                      <TH>{month}</TH>
                      <TH className="w-px">
                        <span className="sr-only">Actions</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {employees.rows.map((e) => {
                      const canPay = Boolean(e.is_active) && due.has(e.id)
                      return (
                        <TR key={e.id} className={cn(!e.is_active && 'text-muted-foreground')}>
                          <TD>
                            <div className="flex items-center gap-3">
                              <Avatar name={e.full_name} muted={!e.is_active} />
                              <div className="min-w-0">
                                <p className="m-0 truncate font-medium text-foreground">
                                  {e.full_name}
                                </p>
                                <p className="m-0 truncate text-xs text-muted-foreground">
                                  {e.role_title}
                                  {e.phone && ` · ${e.phone}`}
                                </p>
                              </div>
                            </div>
                          </TD>
                          <TD className="text-muted-foreground">
                            {e.property_name || 'All properties'}
                          </TD>
                          <TD className="text-right whitespace-nowrap">
                            <p className="m-0 font-semibold text-foreground">
                              {formatMoney(e.monthly_salary)}
                            </p>
                            <p className="m-0 text-xs text-muted-foreground">on day {e.pay_day}</p>
                          </TD>
                          <TD>
                            <SalaryStatus employee={e} due={due.has(e.id)} />
                          </TD>
                          <TD>
                            <div className="flex items-center justify-end gap-1">
                              {canPay && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDialog({ kind: 'pay', employee: e })}
                                >
                                  Pay salary
                                </Button>
                              )}
                              <RowMenu
                                employee={e}
                                canPay={canPay}
                                onEdit={() => setDialog({ kind: 'edit', employee: e })}
                                onPay={() => setDialog({ kind: 'pay', employee: e })}
                              />
                            </div>
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </div>
              <ul className="border-t md:hidden">
                {employees.rows.map((e) => {
                  const canPay = Boolean(e.is_active) && due.has(e.id)
                  return (
                    <li key={e.id} className="border-b px-5 py-3.5 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.full_name} muted={!e.is_active} />
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-[13.5px] font-medium">{e.full_name}</p>
                          <p className="m-0 truncate text-xs text-muted-foreground">
                            {e.role_title} · {e.property_name || 'All properties'}
                          </p>
                        </div>
                        <span className="-mr-2 shrink-0">
                          <RowMenu
                            employee={e}
                            canPay={canPay}
                            onEdit={() => setDialog({ kind: 'edit', employee: e })}
                            onPay={() => setDialog({ kind: 'pay', employee: e })}
                          />
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-3 pl-12">
                        <SalaryStatus employee={e} due={due.has(e.id)} />
                        <span className="text-right text-[13px] tabular-nums">
                          <span className="font-semibold">{formatMoney(e.monthly_salary)}</span>
                          <span className="text-muted-foreground"> · day {e.pay_day}</span>
                        </span>
                      </div>
                      {canPay && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 ml-12 w-[calc(100%-3rem)]"
                          onClick={() => setDialog({ kind: 'pay', employee: e })}
                        >
                          <IndianRupee />
                          Pay salary
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          </>
        )}
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && close()}
        title={title}
        description={
          dialog?.kind === 'pay'
            ? `Salary for ${month}. It is recorded as an expense, once per month.`
            : dialog?.kind === 'edit'
              ? 'Change their job, salary or where they work.'
              : 'Their salary shows up under expenses when you pay it.'
        }
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={formId} busy={saving}>
              {dialog?.kind === 'pay'
                ? `Pay ${dialog.employee.full_name}`
                : dialog?.kind === 'edit'
                  ? 'Save'
                  : 'Add staff member'}
            </Button>
          </>
        }
      >
        {dialog?.kind === 'new' && (
          <EmployeeForm
            formId={formId}
            properties={properties.rows}
            busyChange={setSaving}
            onDone={close}
          />
        )}
        {dialog?.kind === 'edit' && (
          <EmployeeForm
            key={dialog.employee.id}
            formId={formId}
            employee={dialog.employee}
            properties={properties.rows}
            busyChange={setSaving}
            onDone={close}
          />
        )}
        {dialog?.kind === 'pay' && (
          <PayForm
            key={dialog.employee.id}
            formId={formId}
            employee={dialog.employee}
            period={period}
            busyChange={setSaving}
            onDone={close}
          />
        )}
      </Dialog>
    </>
  )
}
