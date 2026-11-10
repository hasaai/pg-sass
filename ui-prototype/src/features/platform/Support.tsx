import { CheckCircle2, Clock, LifeBuoy, Lock, RotateCcw, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Avatar, FilterChips, SearchBox, Status, Toolbar } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { NativeSelect, Textarea } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { PRIORITY } from '../../data/selectors'
import { newId, updateDb, useDb } from '../../data/store'
import type { Priority, SupportTicket } from '../../data/types'
import { cn } from '../../lib/cn'
import { formatDate, plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import { PERSON_SHORT, TICKET_STATUS, daysAgo, formatDateTime, stamp } from './util'

type View = 'board' | 'list'
type StatusFilter = 'all' | SupportTicket['status']
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export function Support() {
  useBreadcrumbs([{ label: 'Support' }])
  const [params, setParams] = useSearchParams()
  const tickets = useDb((db) => db.supportTickets)
  const threads = useExtras((x) => x.tickets)
  const [view, setView] = useState<View>('board')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [mine, setMine] = useState(false)
  const openId = params.get('ticket')

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return tickets
      .filter(
        (t) =>
          !term ||
          t.subject.toLowerCase().includes(term) ||
          t.business.toLowerCase().includes(term),
      )
      .filter((t) => !mine || t.assignedTo === PERSON_SHORT)
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          b.openedOn.localeCompare(a.openedOn),
      )
  }, [tickets, q, mine])

  const listRows = rows.filter((t) => status === 'all' || t.status === status)

  function open(id: string | null) {
    const next = new URLSearchParams(params)
    if (id) next.set('ticket', id)
    else next.delete('ticket')
    setParams(next, { replace: true })
  }

  const lastMessage = (id: string) => {
    const list = threads[id]
    return list?.filter((m) => m.from !== 'note').at(-1)
  }

  return (
    <>
      <PageHeader
        title="Support"
        description={`${plural(tickets.filter((t) => t.status === 'open').length, 'open ticket')} · ${plural(tickets.filter((t) => t.status === 'waiting').length, 'waiting for the customer', 'waiting for the customer')}`}
        actions={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}
          />
        }
      />
      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search tickets or businesses"
          className="w-full sm:max-w-sm"
        />
        <FilterChips<'all' | 'mine'>
          label="Assigned"
          value={mine ? 'mine' : 'all'}
          onChange={(v) => setMine(v === 'mine')}
          options={[
            { value: 'all', label: 'Everyone' },
            {
              value: 'mine',
              label: 'Assigned to me',
              count: tickets.filter((t) => t.assignedTo === PERSON_SHORT).length,
            },
          ]}
        />
      </Toolbar>

      {view === 'board' ? (
        <div className="grid gap-4 md:grid-cols-3">
          {(['open', 'waiting', 'solved'] as const).map((s) => {
            const col = rows.filter((t) => t.status === s)
            return (
              <section key={s} className="rounded-xl border bg-secondary/40 p-3">
                <header className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">
                    {s === 'open' ? 'Open' : s === 'waiting' ? 'Waiting' : 'Solved'}
                  </h2>
                  <span className="rounded-full bg-card px-2 text-xs text-muted-foreground tabular-nums">
                    {col.length}
                  </span>
                </header>
                {col.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-card px-3 py-6 text-center text-[13px] text-muted-foreground">
                    No tickets
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {col.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => open(t.id)}
                          className="w-full rounded-lg border bg-card p-3 text-left shadow-xs transition hover:border-primary/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{t.subject}</p>
                            <Status of={PRIORITY} value={t.priority} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{t.business}</p>
                          {lastMessage(t.id) && (
                            <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
                              “{lastMessage(t.id)?.text}”
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3" /> {daysAgo(t.openedOn)}
                            </span>
                            <span>{t.assignedTo ?? 'Not assigned'}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <>
          <div className="mb-4">
            <FilterChips<StatusFilter>
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All', count: rows.length },
                {
                  value: 'open',
                  label: 'Open',
                  count: rows.filter((t) => t.status === 'open').length,
                },
                {
                  value: 'waiting',
                  label: 'Waiting',
                  count: rows.filter((t) => t.status === 'waiting').length,
                },
                {
                  value: 'solved',
                  label: 'Solved',
                  count: rows.filter((t) => t.status === 'solved').length,
                },
              ]}
            />
          </div>
          {listRows.length === 0 ? (
            <EmptyState icon={<LifeBuoy />} title="No tickets match">
              Try another search or filter.
            </EmptyState>
          ) : (
            <div className="rounded-xl border bg-card shadow-xs">
              <Table>
                <THead>
                  <TR>
                    <TH>Ticket</TH>
                    <TH>Business</TH>
                    <TH>Priority</TH>
                    <TH>Status</TH>
                    <TH>Assigned</TH>
                    <TH>Opened</TH>
                  </TR>
                </THead>
                <TBody>
                  {listRows.map((t) => (
                    <TR key={t.id} className="cursor-pointer" onClick={() => open(t.id)}>
                      <TD className="font-medium">{t.subject}</TD>
                      <TD className="whitespace-nowrap">{t.business}</TD>
                      <TD>
                        <Status of={PRIORITY} value={t.priority} />
                      </TD>
                      <TD>
                        <Status of={TICKET_STATUS} value={t.status} />
                      </TD>
                      <TD className="whitespace-nowrap">
                        {t.assignedTo ?? <span className="text-muted-foreground">Nobody</span>}
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(t.openedOn)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </>
      )}

      <TicketPanel id={openId} onClose={() => open(null)} />
    </>
  )
}

function TicketPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ticket = useDb((db) => db.supportTickets.find((t) => t.id === id))
  const businesses = useDb((db) => db.platformBusinesses)
  const staff = useDb((db) => db.platformStaff)
  const thread = useExtras((x) => (id ? x.tickets[id] : undefined))
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'team' | 'note'>('team')
  const biz = businesses.find((b) => b.name === ticket?.business)

  function change(patch: Partial<SupportTicket>, message: string) {
    if (!ticket) return
    updateDb((db) => {
      db.supportTickets = db.supportTickets.map((t) =>
        t.id === ticket.id ? { ...t, ...patch } : t,
      )
    })
    toast.success(message)
  }

  function send() {
    if (!ticket || !text.trim()) return
    updateExtras((x) => {
      x.tickets[ticket.id] = [
        ...(x.tickets[ticket.id] ?? []),
        { id: newId('tm'), from: kind, by: PERSON_SHORT, at: stamp(), text: text.trim() },
      ]
    })
    if (kind === 'team' && ticket.status === 'open') {
      updateDb((db) => {
        db.supportTickets = db.supportTickets.map((t) =>
          t.id === ticket.id
            ? { ...t, status: 'waiting', assignedTo: t.assignedTo ?? PERSON_SHORT }
            : t,
        )
      })
    }
    toast.success(kind === 'team' ? `Reply sent to ${ticket.business}` : 'Note added for the team')
    setText('')
  }

  return (
    <Dialog
      open={Boolean(ticket)}
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={ticket?.subject ?? ''}
      description={
        ticket && (
          <span>
            {biz ? (
              <Link to={`/platform/businesses/${biz.id}`} className="text-primary hover:underline">
                {ticket.business}
              </Link>
            ) : (
              ticket.business
            )}{' '}
            · opened {formatDate(ticket.openedOn)}
          </span>
        )
      }
      footer={
        ticket &&
        (ticket.status === 'solved' ? (
          <Button
            variant="outline"
            onClick={() => change({ status: 'open' }, 'Ticket opened again')}
          >
            <RotateCcw /> Open again
          </Button>
        ) : (
          <>
            {ticket.status === 'open' && (
              <Button
                variant="outline"
                onClick={() => change({ status: 'waiting' }, 'Marked as waiting for the customer')}
              >
                Waiting for customer
              </Button>
            )}
            <Button
              onClick={() => {
                change({ status: 'solved' }, 'Ticket closed as solved')
                onClose()
              }}
            >
              <CheckCircle2 /> Close as solved
            </Button>
          </>
        ))
      }
    >
      {ticket && (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assigned to">
              <NativeSelect
                value={ticket.assignedTo ?? ''}
                onChange={(e) =>
                  change(
                    { assignedTo: e.target.value || undefined },
                    e.target.value ? `Assigned to ${e.target.value}` : 'Nobody is assigned now',
                  )
                }
              >
                <option value="">Nobody</option>
                {staff
                  .filter((s) => s.status === 'active')
                  .map((s) => {
                    const short = s.name.split(' ')[0] ?? s.name
                    return (
                      <option key={s.id} value={short}>
                        {short}
                      </option>
                    )
                  })}
              </NativeSelect>
            </Field>
            <Field label="Priority">
              <NativeSelect
                value={ticket.priority}
                onChange={(e) =>
                  change(
                    { priority: e.target.value as Priority },
                    `Priority set to ${PRIORITY[e.target.value as Priority].label}`,
                  )
                }
              >
                {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Status of={TICKET_STATUS} value={ticket.status} />
            {biz && (
              <span className="text-xs text-muted-foreground">
                {biz.owner} · {biz.phone}
              </span>
            )}
          </div>

          <ol className="grid gap-3">
            {(thread ?? []).map((m) => (
              <li
                key={m.id}
                className={cn('flex gap-2.5', m.from === 'team' && 'flex-row-reverse')}
              >
                <Avatar name={m.by} size="sm" hue={m.from === 'customer' ? 30 : 262} />
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
                    m.from === 'customer' && 'rounded-tl-sm bg-secondary',
                    m.from === 'team' && 'rounded-tr-sm bg-primary text-primary-foreground',
                    m.from === 'note' &&
                      'rounded-tl-sm border border-amber-200 bg-amber-50 text-amber-950',
                  )}
                >
                  {m.from === 'note' && (
                    <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
                      <Lock className="size-3" /> Team note
                    </p>
                  )}
                  <p className="whitespace-pre-line">{m.text}</p>
                  <p
                    className={cn(
                      'mt-1 text-[11px]',
                      m.from === 'team' ? 'text-primary-foreground/75' : 'text-muted-foreground',
                    )}
                  >
                    {m.by} · {formatDateTime(m.at)}
                  </p>
                </div>
              </li>
            ))}
            {(thread ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            )}
          </ol>

          <form
            className="grid gap-2 rounded-xl border p-3"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <Segmented
              label="Reply or note"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'team', label: 'Reply to customer' },
                { value: 'note', label: 'Team note' },
              ]}
            />
            <Textarea
              aria-label="Message"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                kind === 'team'
                  ? `Write to ${biz?.owner.split(' ')[0] ?? 'the owner'}…`
                  : 'Only our team sees this'
              }
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {kind === 'team'
                  ? 'Sent by email and in the owner’s app.'
                  : 'Not shown to the customer.'}
              </p>
              <Button type="submit" size="sm" disabled={!text.trim()}>
                <Send /> {kind === 'team' ? 'Send reply' : 'Add note'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  )
}
