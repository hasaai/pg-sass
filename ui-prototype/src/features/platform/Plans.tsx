import { Check, Pencil, Plus, Star, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import { PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { useDb } from '../../data/store'
import { cn } from '../../lib/cn'
import { formatMoney, paiseToRupeesInput, plural, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import type { PlanRow } from './extras'
import { Switch } from './Toggle'

const LIMITS = [
  ['properties', 'Properties'],
  ['beds', 'Beds'],
  ['tenants', 'Tenants'],
  ['team', 'Team members'],
] as const

export function Plans() {
  useBreadcrumbs([{ label: 'Plans' }])
  const plans = useExtras((x) => x.plans)
  const businesses = useDb((db) => db.platformBusinesses)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [adding, setAdding] = useState(false)

  const subscribers = useMemo(() => {
    const map: Record<string, { all: number; paying: number; trial: number }> = {}
    for (const p of plans) {
      const list = businesses.filter((b) => b.plan === p.code)
      map[p.code] = {
        all: list.length,
        paying: list.filter((b) => b.planStatus === 'active').length,
        trial: list.filter((b) => b.planStatus === 'trial').length,
      }
    }
    return map
  }, [plans, businesses])

  function toggle(code: string, key: 'active' | 'popular', value: boolean) {
    updateExtras((x) => {
      x.plans = x.plans.map((p) =>
        p.code === code
          ? { ...p, [key]: value }
          : key === 'popular' && value
            ? { ...p, popular: false }
            : p,
      )
    })
    const name = plans.find((p) => p.code === code)?.name
    toast.success(
      key === 'active'
        ? value
          ? `${name} is open for new sign-ups`
          : `${name} is hidden from new sign-ups. Current subscribers keep it.`
        : value
          ? `${name} is marked “Most popular”`
          : `“Most popular” removed from ${name}`,
    )
  }

  return (
    <>
      <PageHeader
        title="Plans"
        description="What owners can buy. Changes apply to new sign-ups and renewals; nobody loses data on a downgrade."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add plan
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const s = subscribers[p.code] ?? { all: 0, paying: 0, trial: 0 }
          return (
            <article
              key={p.code}
              className={cn(
                'relative flex flex-col rounded-xl border bg-card p-5 shadow-xs',
                p.popular && 'border-primary ring-1 ring-primary',
                !p.active && 'opacity-70',
              )}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  <Star className="size-3" /> Most popular
                </span>
              )}
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                {!p.active && <Badge>Hidden</Badge>}
              </div>
              <p className="mt-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatMoney(p.pricePerMonth)}
                </span>
                <span className="text-sm text-muted-foreground"> / month</span>
              </p>
              <p className="text-[13px] text-muted-foreground">
                {p.pricePerYear
                  ? `${formatMoney(p.pricePerYear)} a year`
                  : p.pricePerMonth
                    ? 'Monthly only – no yearly price'
                    : 'Always free'}
                {p.pricePerYear > 0 && p.pricePerMonth > 0 && (
                  <> · saves {Math.round((1 - p.pricePerYear / (p.pricePerMonth * 12)) * 100)}%</>
                )}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-secondary/60 p-3 text-[13px]">
                {LIMITS.map(([k, label]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{p.limits[k] ?? 'No limit'}</dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-4 grid flex-1 content-start gap-1.5 text-[13px]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> {f}
                  </li>
                ))}
              </ul>

              <Link
                to={`/platform/businesses?plan=${p.code}`}
                className="mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] hover:bg-secondary/60"
              >
                <Users className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  <span className="font-medium">{plural(s.all, 'business', 'businesses')}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {s.paying} paying{s.trial ? ` · ${s.trial} on trial` : ''}
                  </span>
                </span>
              </Link>

              <div className="mt-4 border-t pt-2">
                <Switch
                  label="Open for sign-ups"
                  checked={p.active}
                  onChange={(v) => toggle(p.code, 'active', v)}
                />
                <Switch
                  label="Most popular"
                  checked={p.popular}
                  onChange={(v) => toggle(p.code, 'popular', v)}
                />
              </div>
              <Button variant="outline" className="mt-3" onClick={() => setEditing(p)}>
                <Pencil /> Edit plan
              </Button>
            </article>
          )
        })}
      </div>

      <PlanDialog
        key={editing?.code ?? (adding ? 'new' : 'none')}
        open={Boolean(editing) || adding}
        plan={editing}
        onClose={() => {
          setEditing(null)
          setAdding(false)
        }}
      />
    </>
  )
}

function PlanDialog({
  open,
  plan,
  onClose,
}: {
  open: boolean
  plan: PlanRow | null
  onClose: () => void
}) {
  const catalog = useExtras((x) => x.featureCatalog)
  const plans = useExtras((x) => x.plans)
  const [name, setName] = useState(plan?.name ?? '')
  const [monthly, setMonthly] = useState(plan ? paiseToRupeesInput(plan.pricePerMonth) : '')
  const [yearly, setYearly] = useState(plan ? paiseToRupeesInput(plan.pricePerYear) : '')
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(
      LIMITS.map(([k]) => [
        k,
        plan?.limits[k] === null || plan?.limits[k] === undefined ? '' : String(plan.limits[k]),
      ]),
    ),
  )
  const [features, setFeatures] = useState<string[]>(plan?.features ?? [])
  const [tried, setTried] = useState(false)

  const monthlyPaise = rupeesToPaise(monthly || '0')
  const yearlyPaise = rupeesToPaise(yearly || '0')
  const errors = {
    name: !name.trim()
      ? 'Give the plan a name.'
      : plans.some(
            (p) => p.name.toLowerCase() === name.trim().toLowerCase() && p.code !== plan?.code,
          )
        ? 'Another plan already has this name.'
        : undefined,
    monthly: monthlyPaise === null ? 'Type the price in rupees, like 799.' : undefined,
    yearly:
      yearlyPaise === null
        ? 'Type the price in rupees, like 7990.'
        : monthlyPaise !== null && yearlyPaise > monthlyPaise * 12
          ? 'A year should not cost more than 12 months.'
          : undefined,
    limits: LIMITS.some(([k]) => limits[k] && !/^\d+$/.test(limits[k] ?? ''))
      ? 'Limits must be whole numbers, or empty for no limit.'
      : undefined,
    features: features.length === 0 ? 'Tick at least one feature.' : undefined,
  }
  const hasError = Object.values(errors).some(Boolean)
  const allFeatures = [...new Set([...catalog, ...features])]

  function save() {
    setTried(true)
    if (hasError) return
    const row: PlanRow = {
      code:
        plan?.code ??
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_'),
      name: name.trim(),
      pricePerMonth: monthlyPaise ?? 0,
      pricePerYear: yearlyPaise ?? 0,
      limits: {
        properties: limits.properties ? Number(limits.properties) : null,
        beds: limits.beds ? Number(limits.beds) : null,
        tenants: limits.tenants ? Number(limits.tenants) : null,
        team: limits.team ? Number(limits.team) : null,
      },
      features,
      popular: plan?.popular ?? false,
      active: plan?.active ?? true,
    }
    updateExtras((x) => {
      x.plans = plan ? x.plans.map((p) => (p.code === plan.code ? row : p)) : [...x.plans, row]
    })
    toast.success(plan ? `${row.name} plan saved` : `${row.name} plan added`)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={plan ? `Edit ${plan.name}` : 'Add plan'}
      description="Prices include GST. Owners on this plan see the new price at their next renewal."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{plan ? 'Save plan' : 'Add plan'}</Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label="Plan name" required error={tried ? errors.name : undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example: Growth"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price a month (₹)" error={tried ? errors.monthly : undefined}>
            <Input
              inputMode="decimal"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field
            label="Price a year (₹)"
            error={tried ? errors.yearly : undefined}
            hint="Usually 10 months’ price."
          >
            <Input
              inputMode="decimal"
              value={yearly}
              onChange={(e) => setYearly(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-[13px] font-medium">Limits</legend>
          <div className="grid grid-cols-2 gap-3">
            {LIMITS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  inputMode="numeric"
                  value={limits[k]}
                  placeholder="No limit"
                  onChange={(e) => setLimits({ ...limits, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Leave empty for no limit.</p>
          {tried && errors.limits && (
            <p className="text-xs font-medium text-destructive">{errors.limits}</p>
          )}
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">Features</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {allFeatures.map((f) => (
              <label
                key={f}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary/50"
              >
                <Checkbox
                  checked={features.includes(f)}
                  onCheckedChange={(on) =>
                    setFeatures(on === true ? [...features, f] : features.filter((x) => x !== f))
                  }
                />
                {f}
              </label>
            ))}
          </div>
          {tried && errors.features && (
            <p className="mt-1.5 text-xs font-medium text-destructive">{errors.features}</p>
          )}
        </fieldset>
      </div>
    </Dialog>
  )
}
