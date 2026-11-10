import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { api, ApiError } from '../../api/client'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/AuthContext'
import { safeReturnPath } from '../../auth/redirects'
import { AuthHeading, AuthScreen } from '../../components/PublicLayout'
import { ErrorBanner, Spinner } from '../../components/ui'
import { Button } from '../../components/ui-kit/button'
import { Alert } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { CodeInput, PhoneInput } from '../../features/onboarding/MobileCodeForm'
import { countdown } from '../../lib/mobile'

type MobileStatus = components['schemas']['MobileStatus']
type Sent = components['schemas']['Sent']

/** Sign-up step 2: type the 6-digit code sent to the mobile. */
export function VerifyMobilePage() {
  const { user, reloadUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = safeReturnPath((location.state as { from?: unknown } | null)?.from) ?? '/app'
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [wait, setWait] = useState(0)
  const [code, setCode] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [changing, setChanging] = useState(false)
  const [resends, setResends] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api
      .get<MobileStatus>('/auth/mobile/')
      .then((s) => {
        setStatus(s)
        setWait(s.resend_in)
        setChanging(!s.phone)
      })
      .catch(setError)
  }, [])

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  if (user?.phone_verified) return <Navigate to={from} replace />
  if (!status && !error)
    return (
      <AuthScreen>
        <Spinner label="Loading…" />
      </AuthScreen>
    )

  async function send(phone?: string) {
    setBusy(true)
    setError(null)
    try {
      const sent = await api.post<Sent>('/auth/mobile/send-code/', phone ? { phone } : {})
      setStatus((s) => (s ? { ...s, phone_masked: sent.phone_masked } : s))
      setWait(sent.resend_in)
      setResends((n) => n + 1)
      setChanging(false)
      setCode('')
      setNotice(`New code sent to ${sent.phone_masked}.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = Number(/Wait (\d+) seconds/.exec(err.message)?.[1] ?? 0)
        if (seconds) setWait(seconds)
      }
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/mobile/confirm/', { code: code.trim() })
      await reloadUser()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthScreen>
      {changing ? (
        <>
          <AuthHeading title="Your mobile number">
            We send a 6-digit code to confirm it is yours.
          </AuthHeading>
          <form
            className="grid gap-5 rounded-xl border bg-card p-5 shadow-xs sm:p-7"
            onSubmit={(e) => {
              e.preventDefault()
              void send(newPhone)
            }}
            noValidate
          >
            <ErrorBanner error={error} fields={['phone']} />
            <Field
              label="Mobile number"
              error={error instanceof ApiError ? error.fieldError('phone') : undefined}
            >
              <PhoneInput
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98450 12345"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </Field>
            <div className="grid gap-2">
              <Button
                type="submit"
                size="lg"
                className="w-full"
                busy={busy}
                disabled={!newPhone.trim() || wait > 0}
              >
                {wait > 0 ? `Send code in ${countdown(wait)}` : 'Send code'}
              </Button>
              {status?.phone && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setChanging(false)}
                >
                  Back
                </Button>
              )}
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="mb-5 flex size-11 items-center justify-center rounded-xl border bg-card text-primary shadow-xs">
            <Smartphone className="size-5" aria-hidden />
          </div>
          <AuthHeading title="Confirm your mobile">
            Enter the 6-digit code sent to{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {status?.phone_masked}
            </strong>
            . It is valid for 10 minutes.
          </AuthHeading>
          <form
            className="grid gap-5 rounded-xl border bg-card p-5 shadow-xs sm:p-7"
            onSubmit={confirm}
            noValidate
          >
            {notice && !error && (
              <Alert tone="good" className="py-2.5">
                {notice}
              </Alert>
            )}
            <ErrorBanner error={error} fields={['code']} />
            <Field
              label="Code"
              error={error instanceof ApiError ? error.fieldError('code') : undefined}
            >
              <CodeInput
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              busy={busy}
              disabled={code.length !== 6}
            >
              Confirm
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 text-[13px] disabled:text-muted-foreground disabled:opacity-100"
                disabled={wait > 0 || busy}
                onClick={() => void send()}
              >
                {wait > 0 ? `Resend code in ${countdown(wait)}` : 'Resend code'}
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 text-[13px]"
                onClick={() => setChanging(true)}
              >
                Wrong number? Change it
              </Button>
            </div>
            {resends >= 2 && (
              <p className="border-t pt-4 text-[13px] text-muted-foreground">
                Still no code? Check the number, or contact the PG Manager team and we will confirm
                it for you.
              </p>
            )}
          </form>
        </>
      )}
    </AuthScreen>
  )
}
