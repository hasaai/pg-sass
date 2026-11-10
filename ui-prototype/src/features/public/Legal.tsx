/** Placeholder Terms of use and Privacy policy (draft wording for the prototype). */
import { Printer } from 'lucide-react'
import { Link } from 'react-router'

import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'

const VERSION = '2026-11-draft'

type Doc = { title: string; intro: string; sections: [string, string[]][] }

const TERMS: Doc = {
  title: 'Terms of use',
  intro:
    'These terms explain what you can expect from PG Manager and what we expect from you when you use it to run your PG, hostel or co-living business.',
  sections: [
    [
      '1. Who we are',
      [
        'PG Manager is an online service for paying-guest owners and their teams, run from Bengaluru, India. When we say “we” or “us” we mean PG Manager. When we say “you” we mean the person or business that registers.',
      ],
    ],
    [
      '2. Your account',
      [
        'You register with your Indian mobile number and a one-time code. Keep your phone and password safe; anything done from your account is treated as done by you.',
        'You may invite team members. You decide what each person can see and do, and you can switch off their access at any time.',
      ],
    ],
    [
      '3. Your data and your tenants’ data',
      [
        'You own the information you add about your properties, tenants and staff. You must have your tenants’ permission to store their details and ID documents, and you must only use them to run your PG.',
        'We store this data on your behalf and never sell it. See the Privacy policy for details.',
      ],
    ],
    [
      '4. Rent and payments',
      [
        'Tenants pay rent directly to you. PG Manager records payments and sends reminders and receipts; we do not hold or move your tenants’ money.',
      ],
    ],
    [
      '5. Plans, trial and billing',
      [
        'New accounts get a 14-day Pro trial. After that you can choose a paid plan or stay on the Free plan. Plan prices are shown on our pricing page and do not include GST.',
        'If you move to a smaller plan we never delete your data; you only stop adding more than the plan allows.',
      ],
    ],
    [
      '6. Owner identity check',
      [
        'To publish a listing online we may ask you to confirm who you are with an ID and the last 4 characters of its number. This is our own check, not a government verification. We never ask for an Aadhaar OTP, fingerprints or your full Aadhaar number.',
      ],
    ],
    [
      '7. Fair use',
      [
        'Do not use PG Manager to send spam, to store unlawful content or to discriminate unlawfully against tenants. We may suspend accounts that break these rules after giving notice where we can.',
      ],
    ],
    [
      '8. Ending your account',
      [
        'You can stop using PG Manager at any time and download your data first. We keep billing records for as long as Indian tax law requires.',
      ],
    ],
    [
      '9. Changes and contact',
      [
        'We will tell you by email or in the app before these terms change in a way that matters to you. Questions: hello@pgmanager.in.',
      ],
    ],
  ],
}

const PRIVACY: Doc = {
  title: 'Privacy policy',
  intro:
    'This policy explains what personal data PG Manager collects, why, and the choices you have. It is written to follow India’s Digital Personal Data Protection Act, 2023.',
  sections: [
    [
      '1. What we collect',
      [
        'About you: name, mobile number, email, business name and city.',
        'About your tenants and staff (added by you): names, phone numbers, ID type and documents, rent and payment records, complaints.',
        'About how you use the app: pages opened and actions taken, so we can fix problems and keep an activity log for your business.',
      ],
    ],
    [
      '2. Why we use it',
      [
        'To run the service for you, send rent reminders and receipts you ask for, keep your account secure, bill your plan and answer support requests.',
        'We send tips and offers only if you ticked the optional box, and you can stop them at any time.',
      ],
    ],
    [
      '3. Where it is stored',
      [
        'Data is stored on servers in India and encrypted in transit and at rest. ID documents are private files that only you and team members you allow can open; every download is logged.',
      ],
    ],
    [
      '4. Who we share it with',
      [
        'SMS, WhatsApp and email providers – only to deliver the messages you send.',
        'Payment gateways – only for paying your PG Manager plan.',
        'We never sell personal data and never share it for advertising.',
      ],
    ],
    [
      '5. How long we keep it',
      [
        'While your account is open, and up to 90 days after you close it so you can come back. Billing records are kept as long as tax law requires.',
      ],
    ],
    [
      '6. Your rights',
      [
        'You can see, correct, download or delete your data from Settings, or ask us at privacy@pgmanager.in. Tenants can ask their PG owner, or us, to see or correct their data.',
      ],
    ],
    [
      '7. Grievance officer',
      [
        'Name: Grievance Officer, PG Manager, HSR Layout, Bengaluru 560102. Email: grievance@pgmanager.in. We reply within 7 days.',
      ],
    ],
  ],
}

function LegalPage({ doc }: { doc: Doc }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">Draft</Badge>
        <span className="text-xs text-muted-foreground">
          Version {VERSION} · Last changed 2 Nov 2026
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{doc.intro}</p>

      <nav aria-label="Contents" className="mt-8 rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold">Contents</p>
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {doc.sections.map(([h], i) => (
            <li key={h}>
              <a
                href={`#s${i}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`s${i}`)?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="text-primary hover:underline"
              >
                {h}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-8">
        {doc.sections.map(([h, paras], i) => (
          <section key={h} id={`s${i}`} className="scroll-mt-20">
            <h2 className="text-lg font-semibold">{h}</h2>
            {paras.map((p) => (
              <p key={p} className="mt-2 text-[15px] leading-relaxed text-foreground/85">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm">
        <Link to="/register" className="font-medium text-primary hover:underline">
          ← Back to registration
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
    </article>
  )
}

export function TermsPage() {
  return <LegalPage doc={TERMS} />
}

export function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />
}
