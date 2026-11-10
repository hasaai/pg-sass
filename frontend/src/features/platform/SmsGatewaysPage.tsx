import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  MessageSquareText,
  Send,
} from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { components } from '../../api/schema'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import {
  Alert,
  EmptyState,
  ErrorAlert,
  PageHeader,
  Skeleton,
} from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { relativeTime } from '../../lib/format'
import { gatewayStatus } from '../../lib/mobile'
import { cn } from '../../lib/cn'
import { TableSkeleton } from './parts'

type SmsGateway = components['schemas']['SmsGateway']
type TestResult = components['schemas']['TestSmsResult']
type SmsLog = components['schemas']['SmsLog']
type LogPage = { count: number; results: SmsLog[] }

const GATEWAY_QUERIES = ['/platform/sms-gateways/', '/platform/sms-log/']

function GatewayCard({
  g,
  index,
  first,
  last,
  onMove,
}: {
  g: SmsGateway
  index: number
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
}) {
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [editing, setEditing] = useState(false)
  const save = useApiMutation(
    (body: Partial<SmsGateway>) => api.patch<SmsGateway>(`/platform/sms-gateways/${g.code}/`, body),
    GATEWAY_QUERIES,
    () => toast.success('Saved'),
  )
  const test = useApiMutation(
    (body: { phone: string }) =>
      api.post<TestResult>(`/platform/sms-gateways/${g.code}/test/`, body),
    ['/platform/sms-log/'],
    (r) => setResult(r),
  )
  const status = gatewayStatus(g)
  return (
    <Card className={cn('flex flex-col', !g.is_enabled && 'bg-card/70')}>
      <CardHeader
        className="flex-nowrap"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
                g.is_enabled && g.configured
                  ? 'bg-primary-soft text-accent-foreground'
                  : 'bg-secondary text-muted-foreground',
              )}
              title="Order in which gateways are tried"
            >
              {index + 1}
            </span>
            {g.name}
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </span>
        }
        description={g.help}
        actions={
          <div className="-mr-1.5 flex shrink-0 items-center">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Move ${g.name} up`}
              disabled={first}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Move ${g.name} down`}
              disabled={last}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
          </div>
        }
      />
      <CardContent className="grid flex-1 content-start gap-4">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-secondary/40 px-3 py-2.5 text-sm font-medium">
          <Checkbox
            aria-label={`Send codes with ${g.name}`}
            checked={g.is_enabled}
            disabled={!g.configured && !g.is_enabled}
            onCheckedChange={(v) => save.mutate({ is_enabled: v === true })}
          />
          Send codes with {g.name}
        </label>
        {save.error && <p className="text-[13px] text-destructive">{save.error.message}</p>}
        {g.settings_needed.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">Keys and settings</p>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <KeyRound /> Enter keys
              </Button>
            </div>
            <ul className="grid gap-1.5 text-[13px]">
              {g.settings_needed.map((f) => (
                <li key={f.env} className="flex items-start gap-2">
                  {f.is_set ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    {f.label}
                    <span className="block break-all text-xs text-muted-foreground">
                      {f.is_set
                        ? `${f.display} · ${f.set_in === 'portal' ? 'typed here' : 'from backend/.env'}`
                        : 'not set'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {g.unavailable_reason && (
              <p className="mt-2 text-xs text-muted-foreground">{g.unavailable_reason}</p>
            )}
          </div>
        )}
        {g.warnings.map((w) => (
          <Alert key={w} tone="warn">
            {w}
          </Alert>
        ))}
        {g.last_error && (
          <p className="text-xs text-muted-foreground">
            Last problem {g.last_error_at ? relativeTime(g.last_error_at) : ''}: {g.last_error}
          </p>
        )}
        {g.configured && (
          <form
            className="mt-auto flex flex-wrap items-center gap-2 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              setResult(null)
              test.mutate({ phone })
            }}
          >
            <Input
              aria-label={`Mobile for a test SMS with ${g.name}`}
              placeholder="Your mobile"
              inputMode="numeric"
              className="h-8 min-w-0 flex-1 sm:max-w-48"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              type="submit"
              busy={test.isPending}
              disabled={!phone.trim()}
            >
              <Send /> Send test SMS
            </Button>
          </form>
        )}
        {test.error && <ErrorAlert error={test.error} />}
        {result &&
          (result.ok ? (
            <Alert tone="good">Sent (code 123456). Gateway reply: {result.reply_id || 'OK'}</Alert>
          ) : (
            <Alert tone="bad">Not sent. {result.error}</Alert>
          ))}
      </CardContent>
      {editing && <KeysDialog g={g} onClose={() => setEditing(false)} />}
    </Card>
  )
}

/** Type a gateway's keys. Empty boxes keep what is saved; "Remove" clears a typed value. */
function KeysDialog({ g, onClose }: { g: SmsGateway; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const save = useApiMutation(
    (body: { set_credentials: Record<string, string> }) =>
      api.patch<SmsGateway>(`/platform/sms-gateways/${g.code}/`, body),
    GATEWAY_QUERIES,
    () => {
      toast.success('Keys saved')
      onClose()
    },
  )
  function submit() {
    const body: Record<string, string> = {}
    for (const [env, value] of Object.entries(values)) if (value.trim()) body[env] = value.trim()
    for (const env of removed) body[env] = ''
    save.mutate({ set_credentials: body })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${g.name} keys`}
      description="Saved encrypted. Leave a box empty to keep what is saved now."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Save keys
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {g.settings_needed.map((f) => (
          <Field
            key={f.env}
            label={f.label}
            hint={
              f.is_set
                ? `Now: ${f.display} (${f.set_in === 'portal' ? 'typed here' : 'from backend/.env'}). ${f.hint}`
                : f.hint
            }
          >
            <Input
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={f.is_set ? 'Keep as it is' : ''}
              value={values[f.env] ?? ''}
              onChange={(e) => setValues({ ...values, [f.env]: e.target.value })}
            />
          </Field>
        ))}
        {g.settings_needed.some((f) => f.set_in === 'portal') && (
          <div className="grid gap-2 rounded-lg border bg-secondary/40 p-3">
            {g.settings_needed
              .filter((f) => f.set_in === 'portal')
              .map((f) => (
                <label key={f.env} className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={removed.has(f.env)}
                    onCheckedChange={(v) => {
                      const next = new Set(removed)
                      if (v === true) next.add(f.env)
                      else next.delete(f.env)
                      setRemoved(next)
                    }}
                  />
                  Remove the typed {f.label.toLowerCase()} (use backend/.env instead)
                </label>
              ))}
          </div>
        )}
        <ErrorAlert error={save.error} />
      </div>
    </Dialog>
  )
}

export function SmsGatewaysPage() {
  useBreadcrumbs([{ label: 'SMS gateways' }])
  const gateways = useApi<SmsGateway[]>('/platform/sms-gateways/')
  const log = useApi<LogPage>('/platform/sms-log/', { page_size: 50 })
  const reorder = useApiMutation(async (rows: SmsGateway[]) => {
    await Promise.all(
      rows.map((g, i) =>
        g.position === i ? null : api.patch(`/platform/sms-gateways/${g.code}/`, { position: i }),
      ),
    )
  }, GATEWAY_QUERIES)
  const rows = gateways.data ?? []
  function move(index: number, dir: -1 | 1) {
    const next = [...rows]
    const [item] = next.splice(index, 1)
    if (item) next.splice(index + dir, 0, item)
    reorder.mutate(next)
  }
  return (
    <>
      <PageHeader
        title="SMS gateways"
        description="Mobile codes go through the first switched-on gateway; if it fails, the next one sends the same code."
      />
      <ErrorAlert error={gateways.error ?? reorder.error} className="mb-5" />
      {rows.length > 0 &&
        !rows.some((g) => g.code !== 'console' && g.is_enabled && g.configured) && (
          <Alert tone="warn" title="No real SMS gateway is on" className="mb-5">
            Codes are only printed in the backend Terminal, not sent to phones. Enter keys for
            APITxT (the default), 2Factor or Fast2SMS, press Send test SMS, then switch it on.
          </Alert>
        )}
      {gateways.isLoading ? (
        <div className="mb-5 grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          {rows.map((g, i) => (
            <GatewayCard
              key={g.code}
              g={g}
              index={i}
              first={i === 0}
              last={i === rows.length - 1}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </div>
      )}
      <Card className="overflow-hidden">
        <CardHeader title="Recent sends" description="Codes are never stored or shown here." />
        {log.isLoading ? (
          <div className="border-t">
            <TableSkeleton rows={4} avatar={false} />
          </div>
        ) : (log.data?.results.length ?? 0) === 0 ? (
          <div className="border-t p-4">
            <EmptyState
              className="border-0 py-10"
              icon={<MessageSquareText />}
              title="No SMS sent yet"
            >
              Each code sent to a phone is listed here, with the gateway that sent it.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Mobile</TH>
                <TH className="hidden sm:table-cell">Gateway</TH>
                <TH>Result</TH>
                <TH className="text-right">When</TH>
              </TR>
            </THead>
            <TBody>
              {log.data!.results.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="font-mono text-[13px] font-medium">{r.phone_masked}</span>
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      {r.gateway_label}
                    </span>
                  </TD>
                  <TD className="hidden text-[13px] sm:table-cell">
                    <span className="flex items-center gap-1.5">
                      {r.gateway_label}
                      {r.is_test && <Badge tone="neutral">Test</Badge>}
                    </span>
                  </TD>
                  <TD className="max-w-0 min-w-28 text-[13px] sm:max-w-none">
                    {r.ok ? (
                      <Badge tone="good" dot>
                        Sent
                      </Badge>
                    ) : (
                      <span>
                        <Badge tone="bad" dot>
                          Failed
                        </Badge>
                        {r.error && (
                          <span className="mt-1 block truncate text-xs text-muted-foreground sm:whitespace-normal">
                            {r.error}
                          </span>
                        )}
                      </span>
                    )}
                  </TD>
                  <TD className="text-right text-[13px] whitespace-nowrap text-muted-foreground">
                    {relativeTime(r.created_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}
