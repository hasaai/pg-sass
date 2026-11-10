/** Notification centre: overdue rent, complaints, enquiries, documents, check-ins. */
import {
  BellOff,
  CalendarCheck,
  CheckCheck,
  FileWarning,
  Gem,
  IndianRupee,
  Inbox,
  UserCog,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { LineTabs } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { toast } from '../../components/ui-kit/toast'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { useBreadcrumbs } from '../../shell/crumbs'
import { ago, notificationsStore } from './util'
import type { Notif } from './util'

const ICON: Record<Notif['kind'], { icon: typeof Wrench; box: string }> = {
  rent: { icon: IndianRupee, box: 'bg-red-50 text-red-600' },
  complaint: { icon: Wrench, box: 'bg-amber-50 text-amber-700' },
  enquiry: { icon: Inbox, box: 'bg-sky-50 text-sky-700' },
  document: { icon: FileWarning, box: 'bg-orange-50 text-orange-700' },
  checkin: { icon: CalendarCheck, box: 'bg-emerald-50 text-emerald-700' },
  team: { icon: UserCog, box: 'bg-indigo-50 text-indigo-700' },
  plan: { icon: Gem, box: 'bg-violet-50 text-violet-700' },
}

export function NotificationsPage() {
  useBreadcrumbs([{ label: 'Notifications' }])
  const navigate = useNavigate()
  const { can } = useSession()
  const all = notificationsStore.use()
  const [tab, setTab] = useState<'unread' | 'all'>('unread')

  const allowed = all.filter((n) => {
    if (n.kind === 'rent') return can('rent.view')
    if (n.kind === 'plan') return can('plan.billing')
    if (n.kind === 'enquiry') return can('tenants.manage')
    return true
  })
  const unread = allowed.filter((n) => !n.read)
  const list = tab === 'unread' ? unread : allowed

  const markAll = () => {
    notificationsStore.set((ns) => ns.map((n) => ({ ...n, read: true })))
    toast.success('All marked as read')
  }
  const open = (n: Notif) => {
    notificationsStore.set((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    navigate(n.to)
  }
  const toggle = (n: Notif) =>
    notificationsStore.set((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Things that happened while you were away."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/app/settings?tab=notifications')}>
              Settings
            </Button>
            <Button variant="outline" disabled={unread.length === 0} onClick={markAll}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <LineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'unread', label: 'Unread', count: unread.length },
          { value: 'all', label: 'All', count: allowed.length },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<BellOff />}
          title="You’re all caught up"
          actions={
            tab === 'unread' ? (
              <Button variant="outline" onClick={() => setTab('all')}>
                See all notifications
              </Button>
            ) : undefined
          }
        >
          New notifications will show up here.
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {list.map((n) => {
            const I = ICON[n.kind]
            return (
              <li key={n.id} className={cn('flex gap-3 px-4 py-3.5', !n.read && 'bg-accent/40')}>
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    I.box,
                  )}
                >
                  <I.icon className="size-4" />
                </span>
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <p className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{n.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ago(n.at)}</p>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {!n.read && (
                    <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                  )}
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggle(n)}>
                    {n.read ? 'Mark unread' : 'Mark read'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
