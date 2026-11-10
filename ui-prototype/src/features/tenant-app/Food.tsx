import { Coffee, Moon, Sun, ThumbsUp } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../components/ui-kit/button'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { cn } from '../../lib/cn'
import { useMe } from './me'
import { ScreenTitle, TCard } from './ui'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const MENU: Record<(typeof DAYS)[number], { breakfast: string; lunch: string; dinner: string }> = {
  Monday: {
    breakfast: 'Idli, vada, sambar, coconut chutney',
    lunch: 'Rice, dal tadka, beans palya, curd, chapati',
    dinner: 'Chapati, paneer butter masala, jeera rice',
  },
  Tuesday: {
    breakfast: 'Poha, banana, tea / coffee',
    lunch: 'Rice, rasam, mixed veg sagu, curd, pickle',
    dinner: 'Ragi mudde, soppu saaru, rice, buttermilk',
  },
  Wednesday: {
    breakfast: 'Masala dosa, chutney, sagu',
    lunch: 'Bisi bele bath, boondi raita, papad',
    dinner: 'Chapati, egg curry / aloo gobi, rice',
  },
  Thursday: {
    breakfast: 'Upma, kesari bath',
    lunch: 'Rice, sambar, cabbage palya, curd, chapati',
    dinner: 'Veg pulao, raita, dal fry',
  },
  Friday: {
    breakfast: 'Aloo paratha, curd, pickle',
    lunch: 'Lemon rice, curd rice, potato fry',
    dinner: 'Chapati, chana masala, rice, rasam',
  },
  Saturday: {
    breakfast: 'Set dosa, vegetable sagu',
    lunch: 'Rice, dal, bhindi fry, curd, chapati',
    dinner: 'Veg biryani, salan, gulab jamun',
  },
  Sunday: {
    breakfast: 'Puri, potato bhaji, tea / coffee',
    lunch: 'Chicken / mushroom biryani, raita, sweet',
    dinner: 'Light dinner: khichdi, curd, pickle',
  },
}

const MEALS = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    time: '7:30 – 9:30 am',
    icon: Coffee,
    tone: 'bg-amber-100 text-amber-800',
  },
  {
    key: 'lunch',
    label: 'Lunch',
    time: '12:30 – 2:30 pm',
    icon: Sun,
    tone: 'bg-orange-100 text-orange-800',
  },
  {
    key: 'dinner',
    label: 'Dinner',
    time: '7:30 – 9:30 pm',
    icon: Moon,
    tone: 'bg-indigo-100 text-indigo-800',
  },
] as const

function todayName() {
  const d = new Date(`${TODAY}T00:00:00`).getDay()
  return DAYS[(d + 6) % 7] ?? 'Monday'
}

export function FoodMenu() {
  const me = useMe()
  const today = todayName()
  const [day, setDay] = useState<(typeof DAYS)[number]>(today)
  const menu = MENU[day]

  return (
    <>
      <ScreenTitle
        title="Food menu"
        back="/tenant"
        subtitle={`${me.property?.name ?? ''} · Veg, with egg / chicken on some days`}
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={day === d}
            onClick={() => setDay(d)}
            className={cn(
              'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-xs font-medium',
              day === d ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            <span className="text-[15px] font-semibold">{d.slice(0, 3)}</span>
            {d === today && (
              <span className={cn('text-[10px]', day === d ? 'text-white/80' : 'text-primary')}>
                Today
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-3">
        {MEALS.map((m) => (
          <TCard key={m.key} className="flex items-start gap-3">
            <span
              className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', m.tone)}
            >
              <m.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{m.label}</p>
                <span className="text-xs text-muted-foreground">{m.time}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{menu[m.key]}</p>
            </div>
          </TCard>
        ))}
        <Button
          variant="outline"
          size="lg"
          className="h-12 rounded-xl"
          onClick={() => toast.success(`Thanks! The cook will see your feedback for ${day}.`)}
        >
          <ThumbsUp /> Liked today’s food
        </Button>
      </div>

      <h2 className="mb-2 text-[15px] font-semibold">Whole week</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Day</th>
              <th className="px-3 py-2 text-left font-medium">Breakfast</th>
              <th className="px-3 py-2 text-left font-medium">Lunch</th>
              <th className="px-3 py-2 text-left font-medium">Dinner</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => (
              <tr key={d} className={cn('border-t align-top', d === today && 'bg-accent')}>
                <td className="px-3 py-2 font-medium">{d.slice(0, 3)}</td>
                <td className="px-3 py-2">{MENU[d].breakfast}</td>
                <td className="px-3 py-2">{MENU[d].lunch}</td>
                <td className="px-3 py-2">{MENU[d].dinner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Skipping a meal? Tell the warden by 10 am so less food is cooked.
      </p>
    </>
  )
}
