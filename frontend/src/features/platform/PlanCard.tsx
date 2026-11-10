import { useState } from 'react'

import { useAuth } from '../../auth/AuthContext'
import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Dialog } from '../../components/ui-kit/dialog'
import { ErrorAlert, Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { cn } from '../../lib/cn'
import { formatDate, relativeTime } from '../../lib/format'
import type { Plan, PlatformSubscription } from '../plans/plans'
import { limitsFromForm, planStatusWords, usageLevel, usageWords } from '../plans/plans'
import { TimelineItem } from './parts'

function ChangePlanDialog({
  orgId,
  sub,
  onClose,
}: {
  orgId: string
  sub: PlatformSubscription
  onClose: () => void
}) {
  const plans = useApi<Plan[]>('/platform/plans/')
  const [plan, setPlan] = useState(sub.plan ?? '')
  const [endsOn, setEndsOn] = useState(sub.ends_on ?? '')
  const [note, setNote] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sub.summary.usage.map((u) => [
        u.key,
        u.key in sub.limit_overrides ? String(sub.limit_overrides[u.key] ?? '') : '',
      ]),
    ),
  )
  const [problem, setProblem] = useState('')
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      api.put<PlatformSubscription>(`/platform/organizations/${orgId}/subscription/`, body),
    [`/platform/organizations/${orgId}/`, '/platform/payments/'],
    () => {
      toast.success('Plan changed')
      onClose()
    },
  )
  function submit() {
    // Only boxes with a number are custom limits; empty boxes use the plan's own limit.
    const filled = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v.trim() !== ''))
    const parsed = limitsFromForm(filled)
    if (parsed.bad.length) {
      setProblem('Custom limits must be whole numbers.')
      return
    }
    setProblem('')
    save.mutate({ plan, ends_on: endsOn || null, limit_overrides: parsed.limits, note })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Change plan"
      description="Takes effect at once. The business keeps everything it already added."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={!plan} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Plan" required>
          <NativeSelect value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Choose…</option>
            {(plans.data ?? [])
              .filter((p) => p.is_active || p.key === sub.plan)
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Ends on" hint="Leave empty for no end date.">
          <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
        <fieldset className="grid gap-2 rounded-xl border bg-secondary/30 p-4">
          <legend className="px-1 text-[13px] font-semibold">
            Custom limits for this business
          </legend>
          <p className="-mt-1 text-xs text-muted-foreground">
            Leave empty to use the plan's limit.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {sub.summary.usage.map((u) => (
              <Field key={u.key} label={u.label}>
                <Input
                  inputMode="numeric"
                  value={overrides[u.key] ?? ''}
                  onChange={(e) => setOverrides({ ...overrides, [u.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </fieldset>
        <Field label="Note" hint="Why, for example a special deal. Kept in the history.">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {problem && <p className="text-[13px] text-destructive">{problem}</p>}
        <ErrorAlert error={save.error} />
      </div>
    </Dialog>
  )
}

export function PlanCard({ orgId }: { orgId: string }) {
  const { canPlatform } = useAuth()
  const sub = useApi<PlatformSubscription>(`/platform/organizations/${orgId}/subscription/`)
  const [changing, setChanging] = useState(false)
  if (sub.isLoading)
    return (
      <Card>
        <div className="grid gap-4 p-5" role="status" aria-label="Loading">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </Card>
    )
  if (!sub.data?.summary) return <ErrorAlert error={sub.error} />
  const s = sub.data
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Plan: {s.summary.plan_name}
            <Badge tone={s.summary.status === 'expired' ? 'warn' : 'info'} dot>
              {s.summary.status_label}
            </Badge>
          </span>
        }
        description={planStatusWords(s.summary)}
        actions={
          canPlatform('p.subscriptions.assign') && (
            <Button size="sm" variant="outline" onClick={() => setChanging(true)}>
              Change plan
            </Button>
          )
        }
      />
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {s.summary.usage.map((u) => {
            const level = usageLevel(u)
            const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0
            return (
              <div key={u.key} className="min-w-0 rounded-lg border bg-secondary/30 px-3 py-2.5">
                <dt className="truncate text-xs text-muted-foreground">
                  {u.label}
                  {u.key in s.limit_overrides && ' (custom)'}
                </dt>
                <dd
                  className={cn(
                    'mt-0.5 text-[14px] font-semibold tabular-nums',
                    level === 'full' && 'text-destructive',
                    level === 'near' && 'text-amber-700',
                  )}
                >
                  {usageWords(u)}
                </dd>
                {u.limit !== null && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <div
                      className={cn(
                        'h-full rounded-full',
                        level === 'full'
                          ? 'bg-destructive'
                          : level === 'near'
                            ? 'bg-warning'
                            : 'bg-primary',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </dl>
        {s.history.length > 0 && (
          <div>
            <h3 className="mb-3 text-[13px] font-semibold">History</h3>
            <ol>
              {s.history.slice(0, 8).map((h, i, list) => (
                <TimelineItem
                  key={h.id}
                  last={i === list.length - 1}
                  tone={i === 0 ? 'brand' : 'neutral'}
                  title={
                    <>
                      {h.kind_label}:{' '}
                      <span className="font-normal">
                        {h.from_plan ? `${h.from_plan} → ` : ''}
                        {h.to_plan}
                        {h.ends_on && ` until ${formatDate(h.ends_on)}`}
                      </span>
                    </>
                  }
                  meta={
                    <>
                      {h.by ?? 'System'} · {relativeTime(h.created_at)}
                      {h.note && ` · ${h.note}`}
                    </>
                  }
                />
              ))}
            </ol>
          </div>
        )}
      </CardContent>
      {changing && <ChangePlanDialog orgId={orgId} sub={s} onClose={() => setChanging(false)} />}
    </Card>
  )
}
