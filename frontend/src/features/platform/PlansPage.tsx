import { Building2, Gem, IndianRupee, Pencil, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, Textarea } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { formatMoney, paiseToRupeesInput, rupeesToPaise } from '../../lib/format'
import type { Plan, PlanCatalog } from '../plans/plans'
import { limitWords, limitsFromForm, limitsToForm } from '../plans/plans'
import { Kpi, LogoTile, TableSkeleton } from './parts'

const PLAN_LIST = ['/platform/plans/']

/** A titled block inside the plan form, with a hairline above it. */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <fieldset className="grid gap-3 border-t pt-5">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </fieldset>
  )
}

function PlanDialog({
  plan,
  catalog,
  onClose,
}: {
  plan: Plan | null
  catalog: PlanCatalog
  onClose: () => void
}) {
  const limitKeys = catalog.limits.map((l) => l.key)
  const [key, setKey] = useState(plan?.key ?? '')
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [month, setMonth] = useState(plan ? paiseToRupeesInput(plan.price_month ?? 0) : '')
  const [year, setYear] = useState(plan ? paiseToRupeesInput(plan.price_year ?? 0) : '')
  const [trial, setTrial] = useState(String(plan?.trial_days ?? 0))
  const [limits, setLimits] = useState(() => limitsToForm(limitKeys, plan?.limits))
  const [features, setFeatures] = useState(() => new Set(plan?.features ?? []))
  const [allowances, setAllowances] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      catalog.allowances.map((a) => [a.key, String(plan?.allowances?.[a.key] ?? 0)]),
    ),
  )
  const [isPublic, setIsPublic] = useState(plan?.is_public ?? true)
  const [isActive, setIsActive] = useState(plan?.is_active ?? true)
  const [problem, setProblem] = useState('')

  const save = useApiMutation(
    (body: Partial<Plan>) =>
      plan
        ? api.patch<Plan>(`/platform/plans/${plan.id}/`, body)
        : api.post<Plan>('/platform/plans/', body),
    PLAN_LIST,
    () => {
      toast.success(plan ? 'Plan saved' : 'Plan added')
      onClose()
    },
  )

  function submit() {
    const parsed = limitsFromForm(limits)
    if (parsed.bad.length) {
      setProblem('Limits must be whole numbers. Leave a box empty for no limit.')
      return
    }
    const priceMonth = month.trim() ? rupeesToPaise(month) : 0
    const priceYear = year.trim() ? rupeesToPaise(year) : 0
    if (priceMonth === null || priceYear === null) {
      setProblem('Enter prices in rupees, for example 499.')
      return
    }
    setProblem('')
    save.mutate({
      key: key.trim(),
      name: name.trim(),
      description: description.trim(),
      price_month: priceMonth,
      price_year: priceYear,
      trial_days: Number(trial) || 0,
      limits: parsed.limits,
      features: catalog.features.map((f) => f.key).filter((k) => features.has(k)),
      allowances: Object.fromEntries(
        Object.entries(allowances).map(([k, v]) => [k, Number(v) || 0]),
      ),
      is_public: isPublic,
      is_active: isActive,
    })
  }

  return (
    <Dialog
      open
      variant="side"
      onOpenChange={(o) => !o && onClose()}
      title={plan ? `Edit ${plan.name}` : 'Add a plan'}
      description="Changes apply at once to every business on this plan."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Save plan
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={save.error?.fieldError('name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field
            label="Short code"
            hint="Lowercase, used inside the app. Cannot be changed later."
            required
            error={save.error?.fieldError('key')}
          >
            <Input value={key} disabled={!!plan} onChange={(e) => setKey(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" hint="Shown to owners when they choose a plan.">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Price a month (₹)" hint="0 or empty = free">
            <Input inputMode="decimal" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="Price a year (₹)">
            <Input inputMode="decimal" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Free trial days" hint="For new businesses">
            <Input inputMode="numeric" value={trial} onChange={(e) => setTrial(e.target.value)} />
          </Field>
        </div>

        <FormSection title="Limits" hint="Leave a box empty for no limit.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {catalog.limits.map((l) => (
              <Field key={l.key} label={l.label} error={save.error?.fieldError('limits')}>
                <Input
                  inputMode="numeric"
                  placeholder="No limit"
                  value={limits[l.key] ?? ''}
                  onChange={(e) => setLimits({ ...limits, [l.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </FormSection>

        <FormSection title="Features">
          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.features.map((f) => (
              <CheckboxRow
                key={f.key}
                className="rounded-lg border px-3 py-2.5 transition-colors hover:bg-secondary/40"
                label={f.label}
                hint={f.description}
                checked={features.has(f.key)}
                onCheckedChange={(v) => {
                  const next = new Set(features)
                  if (v === true) next.add(f.key)
                  else next.delete(f.key)
                  setFeatures(next)
                }}
              />
            ))}
          </div>
        </FormSection>

        {catalog.allowances.length > 0 && (
          <FormSection title="Included each month">
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.allowances.map((a) => (
                <Field key={a.key} label={a.label} hint={a.description}>
                  <Input
                    inputMode="numeric"
                    value={allowances[a.key] ?? '0'}
                    onChange={(e) => setAllowances({ ...allowances, [a.key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </FormSection>
        )}

        <FormSection title="Who can see it">
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxRow
              label="Owners can choose it"
              hint="Off: only the platform team can give it (special deals)."
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(v === true)}
            />
            <CheckboxRow
              label="Active"
              hint="Off: hidden everywhere; businesses on it keep it."
              checked={isActive}
              onCheckedChange={(v) => setIsActive(v === true)}
            />
          </div>
        </FormSection>
        {problem && <p className="text-[13px] font-medium text-destructive">{problem}</p>}
        <ErrorAlert error={save.error} />
      </div>
    </Dialog>
  )
}

export function PlansPage() {
  useBreadcrumbs([{ label: 'Plans' }])
  const plans = useApi<Plan[]>('/platform/plans/')
  const catalog = useApi<PlanCatalog>('/platform/plan-catalog/')
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const rows = plans.data ?? []
  const loading = plans.isLoading || catalog.isLoading
  return (
    <>
      <PageHeader
        title="Plans"
        description="What each membership plan allows. Businesses get these limits and features at once."
        actions={
          <Button onClick={() => setEditing('new')} disabled={!catalog.data}>
            <Plus /> Add plan
          </Button>
        }
      />
      <ErrorAlert error={plans.error ?? catalog.error} className="mb-5" />
      {loading ? (
        <div className="grid gap-5" role="status" aria-label="Loading">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Card className="overflow-hidden">
            <TableSkeleton rows={4} />
          </Card>
        </div>
      ) : rows.length === 0 || !catalog.data ? (
        <EmptyState
          icon={<Gem />}
          title="No plans yet"
          actions={
            catalog.data && (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Add plan
              </Button>
            )
          }
        >
          Add a plan to set what businesses can use and what they pay.
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Kpi
              label="Plans"
              value={rows.filter((p) => p.is_active).length}
              icon={<Gem />}
              hint={`${rows.filter((p) => !p.is_public).length} only by the team`}
            />
            <Kpi
              label="Businesses on a plan"
              value={rows.reduce((n, p) => n + (p.businesses ?? 0), 0)}
              icon={<Building2 />}
            />
            <Kpi
              label="On a paid plan"
              value={rows
                .filter((p) => (p.price_month ?? 0) > 0 || (p.price_year ?? 0) > 0)
                .reduce((n, p) => n + (p.businesses ?? 0), 0)}
              icon={<IndianRupee />}
            />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Plan</TH>
                  <TH className="text-right">Price</TH>
                  {catalog.data.limits.map((l) => (
                    <TH key={l.key} className="hidden text-right lg:table-cell">
                      {l.label}
                    </TH>
                  ))}
                  <TH className="hidden text-right sm:table-cell">Businesses</TH>
                  <TH className="w-12">
                    <span className="sr-only">Edit</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id} className={p.is_active ? undefined : 'opacity-70'}>
                    <TD className="min-w-44">
                      <div className="flex items-center gap-3">
                        <LogoTile icon={<Gem />} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13.5px] font-medium">{p.name}</span>
                            {!p.is_public && <Badge tone="outline">Only by the team</Badge>}
                            {!p.is_active && <Badge tone="warn">Hidden</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(p.features ?? []).length} features
                            {p.trial_days ? ` · ${p.trial_days}-day trial` : ''}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-right text-[13px] whitespace-nowrap">
                      <span className="font-medium">
                        {p.price_month ? `${formatMoney(p.price_month)} / month` : 'Free'}
                      </span>
                      {p.price_year ? (
                        <span className="block text-xs text-muted-foreground">
                          {formatMoney(p.price_year)} / year
                        </span>
                      ) : null}
                    </TD>
                    {catalog.data!.limits.map((l) => (
                      <TD
                        key={l.key}
                        className={
                          'hidden text-right text-[13px] lg:table-cell' +
                          (p.limits?.[l.key] == null ? ' text-muted-foreground' : '')
                        }
                      >
                        {limitWords(p.limits?.[l.key])}
                      </TD>
                    ))}
                    <TD className="hidden text-right font-medium sm:table-cell">{p.businesses}</TD>
                    <TD className="pl-0 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        <Pencil />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
      {editing && catalog.data && (
        <PlanDialog
          plan={editing === 'new' ? null : editing}
          catalog={catalog.data}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
