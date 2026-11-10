/** Sign in, register (mobile + code), about you, forgot password, confirm email. */
import { ArrowLeft, CheckCircle2, Eye, EyeOff, MailCheck, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Alert } from '../../components/ui-kit/feedback'
import { Button } from '../../components/ui-kit/button'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui-kit/tabs'
import { toast } from '../../components/ui-kit/toast'
import { updateDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { AuthCard, MobileInput, OtpInput, Steps } from './parts'
import { maskMobile, mobileError, useCountdown } from './util'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/* ------------------------------------------------------------------ code step */

function CodeStep({
  mobile,
  onBack,
  onDone,
  busyLabel,
}: {
  mobile: string
  onBack: () => void
  onDone: () => void
  busyLabel: string
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { left, restart } = useCountdown(60)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (code.length < 6) {
      setError('Type all 6 digits of the code we sent you')
      return
    }
    setError('')
    setBusy(true)
    window.setTimeout(onDone, 600)
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div className="flex items-start gap-3 rounded-lg bg-secondary px-3 py-2.5 text-sm">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          Code sent to <span className="font-semibold tabular-nums">{maskMobile(mobile)}</span>
          <button
            type="button"
            onClick={onBack}
            className="ml-2 font-medium text-primary hover:underline"
          >
            Change number
          </button>
        </div>
      </div>
      <div className="grid gap-2">
        <OtpInput value={code} onChange={setCode} invalid={!!error} />
        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Prototype: any 6 digits work. The code is valid for 10 minutes.
          </p>
        )}
      </div>
      <Button type="submit" size="lg" busy={busy} disabled={code.length < 6 && !error}>
        {busy ? busyLabel : 'Continue'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Didn’t get it?{' '}
        {left > 0 ? (
          <span className="tabular-nums">Resend in {left}s</span>
        ) : (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              restart()
              setCode('')
              toast.success(`New code sent to ${maskMobile(mobile)}`)
            }}
          >
            Resend code
          </button>
        )}
      </p>
    </form>
  )
}

/* ------------------------------------------------------------------ login */

export function LoginPage() {
  const navigate = useNavigate()
  const { setRole } = useSession()
  const [params] = useSearchParams()
  const teamLogin = params.get('team') === '1'
  const [tab, setTab] = useState(teamLogin ? 'email' : 'mobile')

  const [mobile, setMobile] = useState('')
  const [mobileErr, setMobileErr] = useState('')
  const [codeStep, setCodeStep] = useState(false)

  const [email, setEmail] = useState(teamLogin ? 'san@pgmanager.in' : '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [busy, setBusy] = useState(false)

  function finish(isPlatform: boolean) {
    setRole(isPlatform ? 'platform' : 'owner')
    toast.success(isPlatform ? 'Signed in to the PG Manager team area' : 'Welcome back, Asha')
    navigate(isPlatform ? '/platform' : '/app')
  }

  function sendCode(e: FormEvent) {
    e.preventDefault()
    const err = mobileError(mobile)
    setMobileErr(err)
    if (err) return
    toast.success(`Code sent to ${maskMobile(mobile)}`)
    setCodeStep(true)
  }

  function signInEmail(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter your email, like name@example.com'
    if (password.length < 1) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    window.setTimeout(() => finish(email.toLowerCase().includes('pgmanager')), 600)
  }

  return (
    <AuthCard
      title={teamLogin ? 'PG Manager team sign-in' : 'Sign in'}
      description={
        teamLogin
          ? 'For PG Manager staff only. Use your work email.'
          : 'Owners, managers, accountants and caretakers sign in here.'
      }
      footer={
        <>
          New to PG Manager?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Register your PG
          </Link>
        </>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-1">
          <TabsTrigger value="mobile">Mobile number</TabsTrigger>
          <TabsTrigger value="email">Email and password</TabsTrigger>
        </TabsList>

        <TabsContent value="mobile">
          {codeStep ? (
            <CodeStep
              mobile={mobile}
              onBack={() => setCodeStep(false)}
              onDone={() => finish(false)}
              busyLabel="Signing in…"
            />
          ) : (
            <form onSubmit={sendCode} className="grid gap-4" noValidate>
              <Field
                label="Mobile number"
                error={mobileErr}
                hint="We’ll send a 6-digit code by SMS."
              >
                <MobileInput value={mobile} onChange={setMobile} invalid={!!mobileErr} />
              </Field>
              <Button type="submit" size="lg">
                Send code
              </Button>
            </form>
          )}
        </TabsContent>

        <TabsContent value="email">
          <form onSubmit={signInEmail} className="grid gap-4" noValidate>
            <Field label="Email" error={errors.email}>
              <Input
                type="email"
                autoComplete="email"
                className="h-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <div className="grid gap-1.5">
              <Field label="Password" error={errors.password}>
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="h-10 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={show ? 'Hide password' : 'Show password'}
                    onClick={() => setShow((v) => !v)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Link
                to="/forgot-password"
                className="justify-self-end text-[13px] font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" size="lg" busy={busy}>
              Sign in
            </Button>
            <p className="text-xs text-muted-foreground">
              Prototype: any password works. An email with “pgmanager” opens the PG Manager team
              area.
            </p>
          </form>
        </TabsContent>
      </Tabs>
    </AuthCard>
  )
}

/* ------------------------------------------------------------------ register */

export function RegisterPage() {
  const navigate = useNavigate()
  const { setRole } = useSession()
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [mobile, setMobile] = useState('')
  const [mobileErr, setMobileErr] = useState('')
  const [step, setStep] = useState<'start' | 'code'>('start')

  const consented = terms && privacy

  function start(e: FormEvent) {
    e.preventDefault()
    const err = mobileError(mobile)
    setMobileErr(err)
    if (err || !consented) return
    toast.success(`Code sent to ${maskMobile(mobile)}`)
    setStep('code')
  }

  return (
    <AuthCard
      title={step === 'start' ? 'Register your PG' : 'Enter the code'}
      description={
        step === 'start' ? '14 days of Pro free. No card needed.' : 'We sent a 6-digit code by SMS.'
      }
      top={<Steps steps={['Mobile', 'About you', 'Ready']} current={0} />}
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {step === 'start' ? (
        <form onSubmit={start} className="grid gap-5" noValidate>
          <fieldset className="grid gap-3 rounded-lg border p-4">
            <legend className="px-1 text-[13px] font-medium">Before you start</legend>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
              />
              <span>
                I agree to the{' '}
                <Link
                  to="/terms"
                  target="_blank"
                  className="font-medium text-primary hover:underline"
                >
                  Terms of use
                </Link>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={privacy}
                onCheckedChange={(v) => setPrivacy(v === true)}
              />
              <span>
                I have read the{' '}
                <Link
                  to="/privacy"
                  target="_blank"
                  className="font-medium text-primary hover:underline"
                >
                  Privacy policy
                </Link>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={marketing}
                onCheckedChange={(v) => setMarketing(v === true)}
              />
              <span>
                Send me tips and offers on WhatsApp{' '}
                <span className="text-muted-foreground">(optional)</span>
              </span>
            </label>
          </fieldset>
          <Field label="Your mobile number" error={mobileErr} hint="This is how you will sign in.">
            <MobileInput value={mobile} onChange={setMobile} invalid={!!mobileErr} />
          </Field>
          <Button type="submit" size="lg" disabled={!consented}>
            Send code
          </Button>
          {!consented && (
            <p className="-mt-2 text-center text-xs text-muted-foreground">
              Tick Terms and Privacy to continue.
            </p>
          )}
        </form>
      ) : (
        <CodeStep
          mobile={mobile}
          onBack={() => setStep('start')}
          busyLabel="Creating your account…"
          onDone={() => {
            setRole('owner')
            toast.success('Mobile number confirmed')
            navigate('/register/profile')
          }}
        />
      )}
    </AuthCard>
  )
}

/* ------------------------------------------------------------------ about you */

export function RegisterProfilePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    business: '',
    pgs: '1',
    city: 'Bengaluru',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Enter your full name'
    if (!EMAIL_RE.test(form.email.trim()))
      next.email =
        'Enter an email like name@example.com – we send receipts and your plan bills there'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    window.setTimeout(() => {
      updateDb((db) => {
        db.business.ownerName = form.name.trim()
        db.business.email = form.email.trim()
        db.business.emailConfirmed = false
        if (form.business.trim()) db.business.name = form.business.trim()
        db.business.city = form.city
      })
      toast.success('Your account is ready', {
        description: `We sent a link to ${form.email.trim()} to confirm your email.`,
      })
      navigate('/app/get-started')
    }, 500)
  }

  return (
    <AuthCard
      wide
      title="About you"
      description="A few details so your receipts and bills look right. You can change these later."
      top={<Steps steps={['Mobile', 'About you', 'Ready']} current={1} />}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Your name" required error={errors.name}>
          <Input
            className="h-10"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="Asha Rao"
          />
        </Field>
        <Field
          label="Email"
          required
          error={errors.email}
          hint="We’ll send a link to confirm it. Nothing waits for it."
        >
          <Input
            className="h-10"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Business name" hint="Optional. Shown on receipts, like “Asha Stays”.">
          <Input
            className="h-10"
            value={form.business}
            onChange={(e) => set('business')(e.target.value)}
            placeholder="Asha Stays"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How many PGs do you run?">
            <NativeSelect
              className="h-10"
              value={form.pgs}
              onChange={(e) => set('pgs')(e.target.value)}
            >
              <option value="0">Just starting</option>
              <option value="1">1</option>
              <option value="2-3">2 – 3</option>
              <option value="4-10">4 – 10</option>
              <option value="10+">More than 10</option>
            </NativeSelect>
          </Field>
          <Field label="City">
            <NativeSelect
              className="h-10"
              value={form.city}
              onChange={(e) => set('city')(e.target.value)}
            >
              {['Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Mysuru', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Button type="submit" size="lg" busy={busy} className="mt-2">
          Continue to my dashboard
        </Button>
      </form>
    </AuthCard>
  )
}

/* ------------------------------------------------------------------ forgot password */

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const { left, restart } = useCountdown(30)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter the email you signed up with, like name@example.com')
      return
    }
    setError('')
    setSent(true)
    restart()
  }

  if (sent) {
    return (
      <AuthCard
        title="Check your inbox"
        description={
          <>
            If <span className="font-medium text-foreground">{email}</span> has an account, we sent
            a link to set a new password. The link works for 1 hour.
          </>
        }
      >
        <div className="grid gap-3">
          <div className="flex justify-center py-2">
            <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
              <MailCheck className="size-7" />
            </span>
          </div>
          <Button
            variant="outline"
            disabled={left > 0}
            onClick={() => {
              restart()
              toast.success(`Link sent again to ${email}`)
            }}
          >
            {left > 0 ? `Send again in ${left}s` : 'Send the link again'}
          </Button>
          <Button variant="ghost" onClick={() => setSent(false)}>
            Use a different email
          </Button>
          <Link
            to="/login"
            className="mt-2 inline-flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Type your email and we’ll send a link to set a new one. You can also sign in with your mobile number instead."
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Email" error={error}>
          <Input
            className="h-10"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Button type="submit" size="lg">
          Send link
        </Button>
        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>
      </form>
    </AuthCard>
  )
}

/* ------------------------------------------------------------------ confirm email */

export function ConfirmEmailPage() {
  const navigate = useNavigate()
  useEffect(() => {
    updateDb((db) => {
      db.business.emailConfirmed = true
    })
  }, [])
  return (
    <AuthCard
      title="Email confirmed"
      description="Thank you. Receipts copies and plan bills will come to this email."
    >
      <div className="grid gap-4">
        <Alert tone="good" title="All done">
          You don’t need to do anything else.
        </Alert>
        <div className="flex justify-center py-2">
          <CheckCircle2 className="size-14 text-emerald-600" />
        </div>
        <Button size="lg" onClick={() => navigate('/app')}>
          Go to my dashboard
        </Button>
      </div>
    </AuthCard>
  )
}
