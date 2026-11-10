import { Link } from 'react-router'

import { Badge } from '../../components/ui-kit/badge'
import { cn } from '../../lib/cn'

const VERSION = '2026-11-draft'

const TEXT = {
  terms: {
    title: 'Terms and Conditions',
    body: [
      'This is a placeholder. The final Terms and Conditions will be published here before launch.',
      'They will cover who may use PG Manager, what owners are responsible for, fees and plans, and how accounts can be closed.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    body: [
      'This is a placeholder. The final Privacy Policy will be published here before launch.',
      'It will cover what we collect (such as your mobile number and email), why, how long we keep it, who can see it, and how to ask for it to be deleted.',
    ],
  },
} as const

const linkClass = 'font-medium text-primary no-underline hover:underline'

/** Terms and Privacy pages. The version is recorded with every acceptance. */
export function LegalPage({ kind }: { kind: keyof typeof TEXT }) {
  const page = TEXT[kind]
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <nav aria-label="Legal pages" className="mb-8 inline-flex gap-1 rounded-lg bg-secondary p-1">
        {(Object.keys(TEXT) as (keyof typeof TEXT)[]).map((k) => (
          <Link
            key={k}
            to={`/${k}`}
            aria-current={k === kind ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-[13px] font-medium no-underline transition-colors',
              k === kind
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(15_23_32/0.08),0_0_0_1px_rgb(15_23_32/0.04)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {TEXT[k].title}
          </Link>
        ))}
      </nav>
      <article className="animate-in">
        <header className="border-b pb-6">
          <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.025em] sm:text-[34px]">
            {page.title}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Badge tone="warn">Draft</Badge>
            <span>Version {VERSION}</span>
          </p>
        </header>
        <div className="mt-6 grid max-w-[65ch] gap-4 text-[15px] leading-7 text-foreground/90">
          {page.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 text-[13px] text-muted-foreground shadow-xs">
          <span>Questions about this page? Ask the PG Manager team.</span>
          <Link to="/register" className={linkClass}>
            Back to sign-up
          </Link>
        </div>
      </article>
    </div>
  )
}
