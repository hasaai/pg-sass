import type { components } from '../../api/schema'
import { formatMoney } from '../../lib/format'

type S = components['schemas']
export type MyPlan = S['MyPlan']
export type Usage = S['Usage']
export type PublicPlan = S['PublicPlan']
export type Plan = S['Plan']
export type PlanCatalog = S['PlanCatalog']
export type CheckoutGateway = S['CheckoutGateway']
export type PlanPayment = S['PlanPayment']
export type PlanCheckoutResult = S['PlanCheckoutResult']
export type PaymentGateway = S['PaymentGateway']
export type PlatformSubscription = S['PlatformSubscription']
export type Period = S['PeriodEnum']

/** Queries to refresh after the plan changes (the owner's plan pages). */
export const PLAN_QUERIES = ['/plan/']

/** "3 of 5", "12 · no limit". */
export function usageWords(u: Pick<Usage, 'used' | 'limit'>): string {
  return u.limit === null ? `${u.used} · no limit` : `${u.used} of ${u.limit}`
}

/** How full a limit is: ok, near (80% or more), full (at or past the limit). */
export function usageLevel(u: Pick<Usage, 'used' | 'limit'>): 'ok' | 'near' | 'full' {
  if (u.limit === null) return 'ok'
  if (u.used >= u.limit) return 'full'
  return u.used >= u.limit * 0.8 ? 'near' : 'ok'
}

/** Limits that are nearly used up, for a warning line. */
export function nearLimits(usage: Usage[]): Usage[] {
  return usage.filter((u) => usageLevel(u) !== 'ok')
}

export function limitWords(limit: number | null | undefined): string {
  return limit === null || limit === undefined ? 'No limit' : String(limit)
}

export function priceWords(plan: Pick<PublicPlan, 'price_month' | 'price_year'>, period: Period) {
  const amount = period === 'year' ? plan.price_year : plan.price_month
  if (!amount) return 'Free'
  return `${formatMoney(amount)} / ${period === 'year' ? 'year' : 'month'}`
}

/** Months saved by paying yearly (e.g. ₹4,990 a year vs ₹499 a month → 2). */
export function monthsSaved(plan: Pick<PublicPlan, 'price_month' | 'price_year'>): number {
  if (!plan.price_month || !plan.price_year) return 0
  return Math.max(0, Math.round(12 - plan.price_year / plan.price_month))
}

/** Text for the plan status line on the owner's page. */
export function planStatusWords(p: Pick<MyPlan, 'status' | 'days_left' | 'ends_on'>): string {
  if (p.status === 'trial')
    return p.days_left === 0 ? 'Free trial ends today' : `Free trial · ${p.days_left} days left`
  if (p.status === 'active' && p.days_left !== null)
    return p.days_left === 0 ? 'Renews or ends today' : `Paid · ${p.days_left} days left`
  if (p.status === 'active') return 'Active · no end date'
  if (p.status === 'expired') return 'Your plan ended. You are on Free until you pay.'
  return 'Free plan'
}

/** Plan editor: a blank limit box means "no limit"; anything else must be a whole number. */
export function limitsFromForm(form: Record<string, string>): {
  limits: Record<string, number | null>
  bad: string[]
} {
  const limits: Record<string, number | null> = {}
  const bad: string[] = []
  for (const [key, raw] of Object.entries(form)) {
    const text = raw.trim()
    if (text === '') limits[key] = null
    else if (/^\d+$/.test(text)) limits[key] = Number(text)
    else bad.push(key)
  }
  return { limits, bad }
}

export function limitsToForm(
  keys: string[],
  limits: Record<string, number | null> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    keys.map((k) => [
      k,
      limits?.[k] === null || limits?.[k] === undefined ? '' : String(limits[k]),
    ]),
  )
}
