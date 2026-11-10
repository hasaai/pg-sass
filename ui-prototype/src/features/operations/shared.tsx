/** Small helpers shared by the operations screens. */
import {
  Armchair,
  Droplets,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  UtensilsCrossed,
  WashingMachine,
  Wifi,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Complaint } from '../../data/types'
import { cn } from '../../lib/cn'

const CATEGORY_ICON: Record<Complaint['category'], LucideIcon> = {
  electrical: Lightbulb,
  plumbing: Droplets,
  cleaning: Sparkles,
  wifi: Wifi,
  food: UtensilsCrossed,
  furniture: Armchair,
  appliance: WashingMachine,
  security: ShieldAlert,
  other: Wrench,
}

export function CategoryIcon({
  category,
  className,
}: {
  category: Complaint['category']
  className?: string
}) {
  const Icon = CATEGORY_ICON[category]
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  )
}

/** Row of stat cards. */
export function KpiRow({ children, cols = 4 }: { children: ReactNode; cols?: 4 | 5 }) {
  return (
    <div
      className={cn(
        'mb-6 grid grid-cols-2 gap-3',
        cols === 5 ? 'md:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-4',
      )}
    >
      {children}
    </div>
  )
}

/** Dashed tile that stands in for picking a photo / file. */
export function UploadTile({
  label,
  done,
  doneLabel,
  onClick,
  icon,
}: {
  label: string
  done: boolean
  doneLabel: string
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left text-sm transition-colors [&_svg]:size-5',
        done
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block font-medium">{done ? doneLabel : label}</span>
        <span className="block text-xs opacity-80">
          {done ? 'Tap to remove' : 'JPG, PNG or PDF, up to 10 MB'}
        </span>
      </span>
    </button>
  )
}

/** Horizontal bar with a label and value, for breakdowns. */
export function BarRow({
  label,
  value,
  max,
  display,
  color = 'bg-primary',
}: {
  label: ReactNode
  value: number
  max: number
  display: ReactNode
  color?: string
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{display}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** A green WhatsApp-style chat bubble preview. */
export function WhatsAppPreview({ to, text }: { to: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-[#efeae2]">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
        <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
          AS
        </span>
        <div className="min-w-0 text-xs">
          <p className="font-semibold">Asha Stays</p>
          <p className="truncate opacity-80">to {to}</p>
        </div>
      </div>
      <div className="p-3">
        <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] whitespace-pre-wrap text-slate-900 shadow-xs">
          {text || 'Your message will appear here.'}
          <span className="mt-1 block text-right text-[10px] text-slate-500">now ✓✓</span>
        </div>
      </div>
    </div>
  )
}
