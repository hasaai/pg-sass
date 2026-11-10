import { ChevronDown, Megaphone, Pin } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FilterChips } from '../../components/common'
import { EmptyState } from '../../components/ui-kit/feedback'
import { toast } from '../../components/ui-kit/toast'
import { updateDb, useDb } from '../../data/store'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { updatePrefs, usePrefs } from './local'
import { useMe } from './me'
import { ScreenTitle } from './ui'

export function Notices() {
  const me = useMe()
  const notices = useDb((db) => db.notices)
  const read = usePrefs((p) => p.readNotices)
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const mine = useMemo(
    () =>
      notices
        .filter((n) => n.audience !== 'staff' && n.propertyIds.includes(me.property?.id ?? ''))
        .sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || b.postedOn.localeCompare(a.postedOn),
        ),
    [notices, me.property?.id],
  )
  const unread = mine.filter((n) => !read.includes(n.id))
  const rows = filter === 'unread' ? unread : mine

  function toggle(id: string) {
    const next = open === id ? null : id
    setOpen(next)
    if (next && !read.includes(id)) {
      updatePrefs((p) => {
        p.readNotices = [...p.readNotices, id]
      })
      updateDb((db) => {
        db.notices = db.notices.map((n) => (n.id === id ? { ...n, readBy: n.readBy + 1 } : n))
      })
    }
  }

  return (
    <>
      <ScreenTitle
        title="Notices"
        subtitle={`From ${me.property?.name ?? 'your PG'}`}
        action={
          unread.length > 0 && (
            <button
              type="button"
              className="text-[13px] font-medium text-primary"
              onClick={() => {
                updatePrefs((p) => {
                  p.readNotices = [...new Set([...p.readNotices, ...mine.map((n) => n.id)])]
                })
                toast.success('All notices marked as read')
              }}
            >
              Mark all read
            </button>
          )
        }
      />
      <div className="mb-4">
        <FilterChips
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: mine.length },
            { value: 'unread', label: 'Unread', count: unread.length },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title={filter === 'unread' ? 'You have read everything' : 'No notices yet'}
        >
          New notices from the PG show up here and on WhatsApp.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {rows.map((n) => {
            const isOpen = open === n.id
            const isUnread = !read.includes(n.id)
            return (
              <li
                key={n.id}
                className={cn(
                  'rounded-2xl border bg-card shadow-xs',
                  n.pinned && 'border-amber-200',
                )}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(n.id)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <span
                    className={cn(
                      'relative flex size-10 shrink-0 items-center justify-center rounded-xl',
                      n.pinned ? 'bg-amber-100 text-amber-800' : 'bg-secondary',
                    )}
                  >
                    {n.pinned ? <Pin className="size-5" /> : <Megaphone className="size-5" />}
                    {isUnread && (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-card"
                        aria-label="Unread"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn('block text-sm', isUnread ? 'font-semibold' : 'font-medium')}
                    >
                      {n.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(n.postedOn)} · {n.postedBy}
                      {n.pinned && ' · Pinned'}
                    </span>
                    {!isOpen && (
                      <span className="mt-1 line-clamp-1 block text-[13px] text-muted-foreground">
                        {n.body}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      'mt-2 size-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="border-t px-4 py-3">
                    <p className="text-sm leading-relaxed whitespace-pre-line">{n.body}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
