import { ChevronRight } from 'lucide-react'
import { useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '../../lib/cn'

import { CrumbsContext } from './crumbs'
import type { Crumb } from './crumbs'

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, set] = useState<Crumb[]>([])
  return <CrumbsContext.Provider value={{ crumbs, set }}>{children}</CrumbsContext.Provider>
}

export function Breadcrumbs() {
  const { crumbs } = useContext(CrumbsContext)
  if (crumbs.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li
              key={`${c.label}-${i}`}
              className={cn('min-w-0 items-center gap-1', last ? 'flex' : 'hidden sm:flex')}
            >
              {i > 0 && (
                <ChevronRight
                  className={cn('size-3.5 shrink-0', last && 'hidden sm:block')}
                  aria-hidden
                />
              )}
              {c.to && !last ? (
                <Link to={c.to} className="truncate hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={last ? 'truncate font-medium text-foreground' : 'truncate'}
                  aria-current={last ? 'page' : undefined}
                >
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
