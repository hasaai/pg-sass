import { Check, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { AsidePanel, AuthHeading, AuthScreen } from '../../components/PublicLayout'
import { Checkbox } from '../../components/ui'
import { MobileCodeForm, SignupSteps } from './MobileCodeForm'

const TRIAL = [
  'Every Pro feature free for 14 days, no card needed',
  'Properties, rooms and beds, or add them all from a spreadsheet',
  'Monthly rent bills made for you, with receipts to share',
  'Stay on the Free plan afterwards if it is enough',
]

const linkClass = 'font-medium text-primary no-underline hover:underline'

/** What sign-up gives you, beside the form. Decorative preview is hidden from screen readers. */
function RegisterAside() {
  return (
    <AsidePanel>
      <p className="text-[13px] font-medium text-primary">Free trial</p>
      <p className="mt-2 max-w-md text-xl leading-snug font-semibold tracking-[-0.02em] sm:text-[22px]">
        Set up your PG today. Collect next month&apos;s rent with fewer phone calls.
      </p>
      <ul className="mt-6 grid gap-3">
        {TRIAL.map((t) => (
          <li key={t} className="flex gap-2.5 text-[14px]">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-foreground">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            {t}
          </li>
        ))}
      </ul>
      <div aria-hidden className="mt-8 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b pb-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-[12px] font-semibold text-white">
            RK
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">Rahul Kumar</p>
            <p className="truncate text-[11px] text-muted-foreground">WhatsApp · Room 101, Bed A</p>
          </div>
        </div>
        <div className="mt-3 max-w-[300px] rounded-lg rounded-tl-sm bg-emerald-50 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-950">
          Hi Rahul, your rent of <span className="font-semibold tabular-nums">₹9,000</span> for
          November is due on 5 Nov. You can pay by UPI. Thank you! – Sri Sai Comforts PG
          <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-emerald-700/80">
            9:30 am <CheckCheck className="size-3.5 text-sky-500" />
          </span>
        </div>
      </div>
    </AsidePanel>
  )
}

/** Owner sign-up, step 1 of 2: agree, give the mobile, type the code. */
export function RegisterPage() {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [step, setStep] = useState<'mobile' | 'code'>('mobile')

  return (
    <AuthScreen aside={<RegisterAside />}>
      <SignupSteps current={step === 'code' ? 1 : 0} />
      <AuthHeading title="Register your PG">
        {step === 'code'
          ? 'Type the code from the SMS. Next you add your name and email.'
          : 'Start with your mobile. Next you add your name and email, and you can use the app straight away.'}
      </AuthHeading>
      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-7">
        <MobileCodeForm
          startUrl="/auth/signup/start"
          finishUrl="/auth/signup/finish"
          extra={{ accept_terms: terms, accept_privacy: privacy, marketing }}
          canSend={terms && privacy}
          onStepChange={setStep}
          beforeSend={
            <div className="grid gap-3 rounded-lg border bg-secondary/40 px-3.5 py-3.5">
              <Checkbox
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                label={
                  <>
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className={linkClass}>
                      Terms and Conditions
                    </Link>
                  </>
                }
              />
              <Checkbox
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                label={
                  <>
                    I agree to the{' '}
                    <Link to="/privacy" target="_blank" className={linkClass}>
                      Privacy Policy
                    </Link>
                  </>
                }
              />
              <Checkbox
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                label={
                  <span className="text-muted-foreground">
                    Send me offers and product news (optional)
                  </span>
                }
              />
            </div>
          }
          onDone={(data) => {
            acceptSession(data)
            navigate(data.user.memberships.length ? '/app' : '/register/profile', {
              replace: true,
            })
          }}
        />
      </div>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Already registered?{' '}
        <Link to="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </AuthScreen>
  )
}
