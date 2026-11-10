import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '../components/ui-kit/button'

/** Shown for any address we do not know, inside the app frame or on its own. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4 py-16">
      <div className="flex max-w-md animate-in flex-col items-center text-center">
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl border bg-gradient-to-b from-card to-secondary text-muted-foreground shadow-xs">
          <SearchX className="size-5" aria-hidden />
        </div>
        <p className="font-mono text-[13px] font-medium text-subtle-foreground tabular-nums">404</p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.022em]">
          Page not found
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          This address does not lead anywhere. The link may be old, or a letter may be mistyped.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">
            <ArrowLeft />
            Go to the home page
          </Link>
        </Button>
      </div>
    </div>
  )
}
