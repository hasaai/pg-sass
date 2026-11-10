import { Building2, Megaphone, MoreHorizontal, Pin, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useApiMutation, useList } from '../../api/hooks'
import type { Notice, Property } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Checkbox, ErrorBanner, SelectField, TextAreaField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { useForm } from '../../lib/useForm'

function NoticeForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const properties = useList<Property>('/properties/')
  const form = useForm({ property: '', title: '', body: '', is_pinned: false })
  const save = useApiMutation(
    (b: Record<string, unknown>) => api.post('/notices/', b),
    ['/notices/'],
    onDone,
  )
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          { ...form.values, property: form.values.property || null },
          { onError: form.setError },
        )
      }}
    >
      <ErrorBanner error={form.error} fields={['title', 'body', 'property']} />
      <SelectField
        label="For"
        placeholder="All properties"
        options={properties.rows.map((p) => ({ value: p.id, label: p.name }))}
        {...form.bind('property')}
      />
      <TextField
        label="Title"
        required
        placeholder="e.g. Water supply off on Sunday morning"
        error={form.fieldError('title')}
        {...form.bind('title')}
      />
      <TextAreaField
        label="Message"
        required
        rows={5}
        error={form.fieldError('body')}
        {...form.bind('body')}
      />
      <Checkbox label="Pin to top" {...form.bindCheck('is_pinned')} />
      <div className="sticky -bottom-5 -mx-6 -mb-5 mt-1 flex flex-wrap justify-end gap-2 border-t bg-card px-6 py-3.5">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" busy={save.isPending}>
          Post notice
        </Button>
      </div>
    </form>
  )
}

function NoticeCard({
  n,
  canManage,
  onDelete,
}: {
  n: Notice
  canManage: boolean
  onDelete: () => void
}) {
  return (
    <Card
      className={cn(
        'flex flex-col data-open:animate-in',
        n.is_pinned && 'border-primary/25 ring-1 ring-primary/10',
      )}
    >
      <div className="flex items-start gap-3 px-5 pt-4">
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
            n.is_pinned
              ? 'bg-primary-soft text-accent-foreground'
              : 'bg-secondary text-muted-foreground',
          )}
          aria-hidden
        >
          {n.is_pinned ? <Pin /> : <Megaphone />}
        </span>
        <div className="min-w-0 flex-1">
          {n.is_pinned && (
            <p className="mb-0.5 text-[11.5px] font-semibold tracking-wide text-accent-foreground uppercase">
              Pinned
            </p>
          )}
          <h2 className="text-[15px] leading-6 font-semibold tracking-[-0.01em] break-words">
            {n.title}
          </h2>
        </div>
        {canManage && (
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mt-1 -mr-2 text-muted-foreground"
                aria-label={`More for ${n.title}`}
              >
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem destructive icon={<Trash2 />} onSelect={onDelete}>
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>
      <p className="flex-1 px-5 pt-3 pb-4 pl-16 text-sm leading-relaxed break-words whitespace-pre-line text-secondary-foreground">
        {n.body}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2.5 text-xs text-muted-foreground">
        <Badge tone="outline">
          <Building2 aria-hidden /> {n.property_name ?? 'All properties'}
        </Badge>
        <span className="tabular-nums">{formatDate(n.created_at)}</span>
      </div>
    </Card>
  )
}

export function NoticesPage() {
  const { can } = useAuth()
  const canManage = can('notices.manage')
  const [adding, setAdding] = useState(false)
  const { rows, isLoading, error } = useList<Notice>('/notices/')
  const remove = useApiMutation((id: string) => api.delete(`/notices/${id}/`), ['/notices/'])
  return (
    <>
      <PageHeader
        title="Notices"
        description="Announcements for residents and staff."
        actions={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Post notice
            </Button>
          )
        }
      />
      <ErrorBanner error={error ?? remove.error} />
      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2" role="status" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No notices yet."
          actions={
            canManage && (
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus /> Post notice
              </Button>
            )
          }
        >
          Post things everyone should know, like water or power cuts, rent dates or house rules.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {rows.map((n) => (
            <NoticeCard
              key={n.id}
              n={n}
              canManage={canManage}
              onDelete={() => remove.mutate(n.id)}
            />
          ))}
        </div>
      )}
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Post notice"
        description="Choose a property, or leave it for all properties."
      >
        <NoticeForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Dialog>
    </>
  )
}
