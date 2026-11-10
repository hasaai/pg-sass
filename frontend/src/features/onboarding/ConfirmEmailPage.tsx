import { Mail, MailCheck, MailX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { request } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { AuthScreen } from '../../components/PublicLayout'
import { ErrorBanner, Spinner } from '../../components/ui'
import { Button } from '../../components/ui-kit/button'
import { cn } from '../../lib/cn'

/** Where the email link lands. Works signed in or not. */
export function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const { status, reloadUser } = useAuth()
  const [state, setState] = useState<'checking' | 'done' | 'failed'>('checking')
  const [error, setError] = useState<unknown>(null)
  const token = params.get('token') ?? ''

  useEffect(() => {
    if (status === 'loading') return
    request('/auth/email/confirm', { method: 'POST', body: { token }, skipRefresh: true })
      .then(async () => {
        setState('done')
        if (status === 'authenticated') await reloadUser()
      })
      .catch((err) => {
        setError(err)
        setState('failed')
      })
    // Run once, after we know whether someone is signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === 'loading'])

  const signedIn = status === 'authenticated'
  return (
    <AuthScreen>
      <div className="rounded-xl border bg-card p-6 text-center shadow-xs sm:p-8">
        <div
          className={cn(
            'mx-auto mb-5 flex size-12 items-center justify-center rounded-xl border shadow-xs',
            state === 'done' && 'border-emerald-600/15 bg-emerald-50 text-emerald-600',
            state === 'failed' && 'border-red-600/15 bg-red-50 text-red-600',
            state === 'checking' && 'bg-card text-primary',
          )}
        >
          {state === 'done' ? (
            <MailCheck className="size-5" aria-hidden />
          ) : state === 'failed' ? (
            <MailX className="size-5" aria-hidden />
          ) : (
            <Mail className="size-5" aria-hidden />
          )}
        </div>
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">
          Confirm your email
        </h1>
        <div className="mt-4 text-left">
          {state === 'checking' && <Spinner label="Checking the link…" />}
        </div>
        {state === 'done' && (
          <p className="text-[14px] text-muted-foreground">Thank you, your email is confirmed.</p>
        )}
        {state === 'failed' && (
          <div className="text-left">
            <ErrorBanner error={error} fields={[]} />
          </div>
        )}
        <Button
          asChild
          size="lg"
          className="mt-2 w-full"
          variant={state === 'failed' ? 'outline' : 'default'}
        >
          <Link to={signedIn ? '/app' : '/login'}>
            {signedIn ? 'Go to my dashboard' : 'Sign in'}
          </Link>
        </Button>
      </div>
    </AuthScreen>
  )
}
