import { ArrowDown, ArrowUp, CheckCircle2, KeyRound, Send, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { updateDb, useDb } from '../../data/store'
import type { SmsGateway } from '../../data/types'
import { cn } from '../../lib/cn'
import { useBreadcrumbs } from '../../shell/crumbs'
import { formatDateTime, stamp } from './util'
import { Switch } from './Toggle'

const TEST = 'console'

export function Sms() {
  useBreadcrumbs([{ label: 'SMS gateways' }])
  const gateways = useDb((db) => db.smsGateways)
  const [replace, setReplace] = useState<SmsGateway | null>(null)
  const [testing, setTesting] = useState(false)

  const list = useMemo(() => [...gateways].sort((a, b) => a.position - b.position), [gateways])
  const realOn = list.filter((g) => g.code !== TEST && g.enabled)
  const inUse = realOn[0] ?? list.find((g) => g.code === TEST)
  const sentToday = list.reduce((s, g) => s + g.sentToday, 0)

  function move(code: string, dir: -1 | 1) {
    const i = list.findIndex((g) => g.code === code)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const order = list.map((g) => g.code)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
    updateDb((db) => {
      db.smsGateways = db.smsGateways.map((g) => ({ ...g, position: order.indexOf(g.code) }))
    })
    toast.success(`${list[i]?.name} moved ${dir < 0 ? 'up' : 'down'}`)
  }

  function toggle(g: SmsGateway, on: boolean) {
    if (on && g.code !== TEST && !g.keyEnding) {
      setReplace(g)
      toast.info(`Add the ${g.name} key first`)
      return
    }
    updateDb((db) => {
      db.smsGateways = db.smsGateways.map((x) => (x.code === g.code ? { ...x, enabled: on } : x))
    })
    toast.success(`${g.name} ${on ? 'switched on' : 'switched off'}`)
  }

  return (
    <>
      <PageHeader
        title="SMS gateways"
        description="Sign-up and sign-in codes are sent through the first gateway that is on. If it fails, the next one is tried."
        actions={
          <Button onClick={() => setTesting(true)}>
            <Send /> Send test SMS
          </Button>
        }
      />

      {realOn.length === 0 ? (
        <Alert tone="bad" className="mb-5" title="No real SMS gateway is on">
          Codes are shown on screen by the Test gateway only. Owners will not get an SMS. Switch on
          a gateway below.
        </Alert>
      ) : (
        <Alert tone="good" className="mb-5" title={`Codes go through ${inUse?.name} now`}>
          {realOn.length > 1
            ? `If it fails, ${realOn
                .slice(1)
                .map((g) => g.name)
                .join(', then ')} is tried next.`
            : 'No backup gateway is on. Switch on a second one so codes still go if this one fails.'}{' '}
          {sentToday} SMS sent today.
        </Alert>
      )}

      <Section
        title="Order"
        description="Use the arrows to change which gateway is tried first."
        bodyClassName="p-0"
      >
        <ol className="divide-y">
          {list.map((g, i) => {
            const isTest = g.code === TEST
            return (
              <li key={g.code} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="flex flex-col gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${g.name} up`}
                    disabled={i === 0}
                    onClick={() => move(g.code, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${g.name} down`}
                    disabled={i === list.length - 1}
                    onClick={() => move(g.code, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                    g.enabled
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{g.name}</p>
                    {inUse?.code === g.code && <Badge tone="good">In use</Badge>}
                    {isTest && <Badge>Only when no real gateway is on</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                    {!isTest && (
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="size-3.5" />
                        {g.keyEnding ? `Key ending ${g.keyEnding}` : 'No key yet'}
                      </span>
                    )}
                    {g.lastOk && (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="size-3.5" /> Last OK {formatDateTime(g.lastOk)}
                      </span>
                    )}
                    {g.lastError && (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <TriangleAlert className="size-3.5" /> {g.lastError}
                      </span>
                    )}
                    <span className="tabular-nums">{g.sentToday} sent today</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!isTest && (
                    <Button size="sm" variant="outline" onClick={() => setReplace(g)}>
                      {g.keyEnding ? 'Replace key' : 'Add key'}
                    </Button>
                  )}
                  <div className="w-24">
                    <Switch
                      label={g.enabled ? 'On' : 'Off'}
                      checked={g.enabled}
                      onChange={(v) => toggle(g, v)}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </Section>
      <p className="mt-4 text-[13px] text-muted-foreground">
        Keys are stored encrypted and are never shown again – only their last 4 characters. A key
        typed here wins over one in the server settings. The Test gateway shows the code on screen
        and is used only when no real gateway is on.
      </p>

      <KeyDialog gateway={replace} onClose={() => setReplace(null)} />
      <TestDialog open={testing} onClose={() => setTesting(false)} gateway={inUse} />
    </>
  )
}

function KeyDialog({ gateway, onClose }: { gateway: SmsGateway | null; onClose: () => void }) {
  const [key, setKey] = useState('')
  const [sender, setSender] = useState('')
  const [tried, setTried] = useState(false)
  const error = tried
    ? !key.trim()
      ? 'Paste the API key from the gateway’s dashboard.'
      : key.trim().length < 12
        ? 'This key looks too short. Copy the whole key.'
        : undefined
    : undefined
  function close() {
    setKey('')
    setSender('')
    setTried(false)
    onClose()
  }
  return (
    <Dialog
      open={Boolean(gateway)}
      onOpenChange={(o) => !o && close()}
      variant="side"
      title={gateway?.keyEnding ? `Replace ${gateway.name} key` : `Add ${gateway?.name ?? ''} key`}
      description="The key is encrypted when saved. Nobody can see it again, not even you."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (!gateway || !key.trim() || key.trim().length < 12) return
              const ending = `…${key.trim().slice(-4)}`
              updateDb((db) => {
                db.smsGateways = db.smsGateways.map((g) =>
                  g.code === gateway.code
                    ? { ...g, keyEnding: ending, lastError: undefined, enabled: true }
                    : g,
                )
              })
              toast.success(`${gateway.name} key saved`, {
                description: `Key ending ${ending}. Gateway switched on.`,
              })
              close()
            }}
          >
            Save key
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {gateway?.keyEnding && (
          <p className="text-sm text-muted-foreground">
            The key now in use ends with{' '}
            <span className="font-mono font-medium text-foreground">{gateway.keyEnding}</span>.
          </p>
        )}
        <Field label="API key" required error={error}>
          <Input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste the new key"
          />
        </Field>
        <Field
          label="Sender ID"
          hint="6 letters approved on DLT, for example PGMNGR. Leave empty to keep the current one."
        >
          <Input
            value={sender}
            maxLength={6}
            onChange={(e) => setSender(e.target.value.toUpperCase())}
            placeholder="PGMNGR"
          />
        </Field>
      </div>
    </Dialog>
  )
}

function TestDialog({
  open,
  onClose,
  gateway,
}: {
  open: boolean
  onClose: () => void
  gateway?: SmsGateway
}) {
  const [phone, setPhone] = useState('98450 12345')
  const [tried, setTried] = useState(false)
  const digits = phone.replace(/\D/g, '').replace(/^91/, '')
  const error =
    tried && !/^[6-9]\d{9}$/.test(digits) ? 'Type a 10-digit Indian mobile number.' : undefined
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Send test SMS"
      description={
        gateway ? `Sent through ${gateway.name}, the first gateway that is on.` : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (!/^[6-9]\d{9}$/.test(digits) || !gateway) return
              updateDb((db) => {
                db.smsGateways = db.smsGateways.map((g) =>
                  g.code === gateway.code
                    ? { ...g, sentToday: g.sentToday + 1, lastOk: stamp() }
                    : g,
                )
              })
              if (gateway.code === TEST) {
                toast.success('Test code: 482913', {
                  description: 'Shown on screen by the Test gateway – no SMS was sent.',
                })
              } else {
                toast.success(`Test SMS sent to +91 ${digits.slice(0, 5)} ${digits.slice(5)}`, {
                  description: `Delivered by ${gateway.name}.`,
                })
              }
              setTried(false)
              onClose()
            }}
          >
            <Send /> Send
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Mobile number" error={error}>
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="rounded-lg bg-secondary/60 p-3 text-[13px]">
          <p className="text-xs text-muted-foreground">Message</p>
          <p className="mt-1">
            482913 is your PG Manager code. It is valid for 10 minutes. Do not share it. – PGMNGR
          </p>
        </div>
      </div>
    </Dialog>
  )
}
