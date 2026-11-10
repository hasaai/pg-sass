import { CircleCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { api, ApiError } from '../../api/client'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/AuthContext'
import { AuthHeading, AuthScreen } from '../../components/PublicLayout'
import { ErrorBanner, Spinner, TextField } from '../../components/ui'
import { Button } from '../../components/ui-kit/button'
import { SignupSteps } from './MobileCodeForm'

type Profile = components['schemas']['ProfileView']

/** Owner sign-up, step 2 of 2: name, email and (optional) business name. */
export function ProfilePage() {
  const { reloadUser } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [values, setValues] = useState({ full_name: '', email: '', business_name: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    api
      .get<Profile>('/onboarding/profile')
      .then((p) => {
        setProfile(p)
        setValues((v) => ({ ...v, full_name: p.full_name, email: p.email ?? '' }))
      })
      .catch(setError)
  }, [])

  if (!profile && !error)
    return (
      <AuthScreen>
        <Spinner label="Loading…" />
      </AuthScreen>
    )
  const fieldError = (name: string) =>
    error instanceof ApiError ? error.fieldError(name) : undefined

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.put('/onboarding/profile', values)
      await reloadUser()
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthScreen>
      <SignupSteps current={2} />
      <AuthHeading title="About you">
        We will email you a link to confirm your email. You can use the app before that.
      </AuthHeading>
      <form className="rounded-xl border bg-card p-5 shadow-xs sm:p-7" onSubmit={save} noValidate>
        {profile?.phone_masked && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-600/15 bg-emerald-50/70 px-3 py-2 text-[13px] text-emerald-900">
            <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
            <span>
              Mobile <span className="font-medium tabular-nums">{profile.phone_masked}</span> is
              confirmed.
            </span>
          </div>
        )}
        <ErrorBanner error={error} fields={['full_name', 'email', 'business_name']} />
        <div className="grid gap-5">
          <TextField
            label="Your name"
            autoComplete="name"
            required
            className="h-10"
            value={values.full_name}
            error={fieldError('full_name')}
            onChange={(e) => setValues({ ...values, full_name: e.target.value })}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            className="h-10"
            value={values.email}
            error={fieldError('email')}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
          />
          {!profile?.has_business && (
            <TextField
              label="Business name (optional)"
              hint="Leave empty to use your name. You can change it later in Settings."
              placeholder="For example, Sri Sai Comforts PG"
              className="h-10"
              value={values.business_name}
              error={fieldError('business_name')}
              onChange={(e) => setValues({ ...values, business_name: e.target.value })}
            />
          )}
          <Button type="submit" size="lg" className="mt-1 w-full" busy={busy}>
            Continue to my dashboard
          </Button>
        </div>
      </form>
    </AuthScreen>
  )
}
