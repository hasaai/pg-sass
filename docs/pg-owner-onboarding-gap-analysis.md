# PG Owner Onboarding: Gap Analysis (Phase 1)

Status: analysis only, no application code changed.
Inspected: repository at commit `e9dbcdb` (2 Nov 2026).
Scope: the 22 onboarding items in the brief. Tenants, rent, payments, staff, reports and plans are out of scope and are not changed by this plan.

## 1. Summary

About half of the target flow already works, in a different order.

- **Works today:**
  - Sign-up with mobile code (`/register` → `/verify-mobile`).
  - The owner account, business and owner membership are created together.
  - A 5-step property form.
  - Property proof documents.
  - A property verification queue on the platform portal, with Verify / Changes needed / Not approved.
- **Missing:**
  - Terms, Privacy and marketing consent.
  - Email verification.
  - An owner identity check and its review.
  - Claim Existing PG.
  - An onboarding dashboard with progress.
  - Decision notifications.
  - Publishing that depends on approval: today the listing "Verified" badge is set by hand in Django admin and is not linked to the property check.
- **Order differs:**
  - Today one form asks for name, mobile, email, password and business name, creates the account, and then asks for the SMS code.
  - The target asks for consent and mobile, then the OTP, then creates the account, then asks for the profile.
- **Blocking (the critical rule):**
  - Only one thing blocks the app today: an unconfirmed mobile. `core/permissions.py::OrgRolePermission` raises 403 `phone_not_verified`, and `frontend/src/auth/guards.tsx::RequireAuth` redirects to `/verify-mobile`. The target allows this, because OTP comes before the dashboard.
  - Nothing blocks on email, owner identity or property verification. A property can be opened, and tenants checked in, while it is "Being checked".
  - Phase 2 must keep this. New checks may only gate public publishing.

## 2. Current workflow (as built)

| Step | Screen / API | Code |
|---|---|---|
| 1 | Home page → "Register my PG" | `frontend/src/features/landing/LandingPage.tsx` |
| 2 | One form: name, mobile, email, password, business name, business phone (optional) | `frontend/src/pages/auth/RegisterPage.tsx` → `POST /api/v1/auth/register` (`apps/accounts/views.py::RegisterView`, `serializers.py::RegisterSerializer`) |
| 3 | Account, business and owner membership created in one transaction, plus a 14-day Pro trial; SMS code sent | `User.objects.create_user`, `apps/organizations/services.py::create_organization_with_owner`, `apps/verification/services.py::send_code` |
| 4 | Type the 6-digit code | `frontend/src/pages/auth/VerifyMobilePage.tsx` → `POST /api/v1/auth/mobile/confirm/` (`apps/verification/views.py::ConfirmCodeView`) sets `User.phone_verified_at` |
| 5 | Dashboard (empty state "Add your first property…") | `frontend/src/pages/app/DashboardPage.tsx` |
| 6 | Add property: 5 steps (type, name and location, building, amenities, logo and photos); saved as "Not finished" | `frontend/src/features/properties/PropertyWizardPage.tsx` → `POST /api/v1/properties/` (`apps/properties/views.py::PropertyViewSet`, `services.py::create_property`) |
| 7 | Rooms and beds, then Open | `PropertyDetailPage.tsx`, `POST /properties/{id}/activate/` (`services.py::change_status`, `readiness`) |
| 8 | Upload proof document, then "Send for checking" | `DocumentsTab.tsx`, `POST /properties/{id}/documents/`, `POST /properties/{id}/submit-verification/` (`services.py::submit_for_verification`) |
| 9 | Reviewer decides on `/platform/verification` | `frontend/src/features/platform/PropertyReviewPage.tsx` → `POST /api/v1/platform/properties/{id}/verification/` (`apps/platform/views.py::PropertyViewSet.verification`, `properties/services.py::decide_verification`) |
| 10 | Public listing (separate) | `apps/listings`; shown publicly only if `Listing.is_verified` and `LISTINGS_REQUIRE_VERIFICATION` (default true; false in `local.py`). `is_verified` is set only in `apps/listings/admin.py` |

Login is email + password only (`POST /api/v1/auth/login`, `LoginView`, `authenticate(email=…)`).

## 3. Target workflow

The brief's stages are:

1. Registration with consent and mobile OTP.
2. Profile (name, email, optional business) and email verification.
3. PG registration (Add New or Claim Existing).
4. Owner verification.
5. Property verification.
6. Onboarding dashboard.
7. Publishing eligibility.

Every verification runs in the background and never blocks the dashboard.

## 4. Gap table

Legend: Done = already implemented, Partial = partially implemented, Missing = not implemented, Wrong = incorrectly implemented for the target, Investigate = needs a decision.

| # | Requirement | Existing implementation | File / API | Gap | Recommended change | Priority |
|---|---|---|---|---|---|---|
| 1 | PG owner registration | Single form creates account, business and owner membership | `RegisterView`, `RegisterSerializer`, `RegisterPage.tsx` | Asks for everything at once; email, password and business name are required | Split into a mobile-first start (consent + mobile + OTP) and a profile step; keep the old endpoint working for existing tests during transition | High |
| 2 | Terms acceptance | None | none | No record of acceptance | New `ConsentRecord` (user, kind, version, accepted_at, ip, user agent); Terms page; required at start | High |
| 3 | Privacy acceptance | None | none | Same | Same model, kind `privacy`; required | High |
| 4 | Optional marketing consent | None | none | Same | Same model, kind `marketing`, optional, can be withdrawn in profile | Medium |
| 5 | Mobile OTP | Done: hash only, 10 minutes, 5 tries, 60-second resend, 5 a day, gateways APITxT → 2Factor → Fast2SMS | `apps/verification/services.py` (`send_code`, `confirm_code`), `sms.py`, `/auth/mobile/*` | Code is tied to an existing user (`PhoneCode.user`), so OTP cannot come before the account | Allow a sign-up code with no user yet (nullable `user`, or a `SignupCode` keyed by phone) and reuse the same limits and gateways | High |
| 6 | Owner account creation | Done, but before OTP | `RegisterView` | Unconfirmed accounts can hold a mobile number | Create the account only after a correct OTP; clean up abandoned starts | High |
| 7 | Owner profile | Partial: `User.full_name`, `email`, `phone` | `apps/accounts/models.py::User`, `MeSerializer` | No profile screen or edit API after sign-up; no "account active" state | `PATCH /auth/me/profile` (name, email); profile step screen; derived onboarding status (no new profile table) | High |
| 8 | Email verification | Missing; `core/notify.py::email` exists, console backend locally | `core/notify.py`, `EMAIL_BACKEND` | No `email_verified_at`, token or screen | `User.email_verified_at`; signed single-use link (`django.core.signing`, 48 hours); resend with limits; never blocks access | High |
| 9 | Organization creation / association | Partial: created at register, name required | `create_organization_with_owner` | Business name optional in target; "associate" not defined | Default name from the owner's name if empty; joining an existing business stays the existing Team invite (owner adds the person) | Medium |
| 10 | PG property registration | Done: wizard, draft status, owner's business | `PropertyWizardPage.tsx`, `PropertyViewSet.create` | Fine for "Add New"; no short reference | Keep; add a human reference (see 13) | Medium |
| 11 | Add New PG | Done | same | none | Reuse | none |
| 12 | Claim Existing PG | Missing; the only pre-existing PG data is marketplace (`Listing`, `PgRequest`) | none | No search, claim request or transfer | `PropertyClaim` (claimant business, property or free-text PG, proof docs, status); platform review; on approval move the property to the claimant's business or create it. Needs a decision on the source of "existing PGs" | Investigate |
| 13 | Basic details (name, type, contact number, city, locality, address) and unique property ID | Partial: name, type, city (default Bengaluru), locality, address; UUID id | `apps/properties/models.py::Property` | No property contact number; no short human ID | Add `Property.contact_phone` and `Property.reference` (e.g. `PG-7K3M9Q`, unique, generated); migration only | Medium |
| 14 | Owner identity verification | Missing | none | No request, documents or status for the person | New `OwnerVerification` (user, business, status, ID type, masked ID number, notes) + `OwnerDocument` (private file); reuse `core.uploads.validate_upload` and `media/private/` | High |
| 15 | PG property verification | Done: 5 states, proof required, history (`VerificationEvent`), re-check on proof change | `properties/services.py`, `DocumentsTab.tsx` | No "Under review" (reviewer picked it up), no per-document notes, no notification | Add `under_review` state and claim-by-reviewer; email the owner on each decision | Medium |
| 16 | Admin review of owner verification | Missing | none | No queue or decisions | Platform page "Owner checks": list, open documents (audited), Approve / Ask for more / Reject with reason. Permission `p.verification.review` (Platform owner, Verification reviewer) | High |
| 17 | Admin review of property verification | Done | `/platform/verification`, `PropertyReviewPage.tsx`, `p.verification.review` | No "Under review"; no notification | See 15 | Medium |
| 18 | Verification status tracking | Partial: property status + history | `Property.verification_status`, `VerificationEvent` | Nothing for owner or email | Separate statuses: mobile, email, owner identity, each property, listing approval; one history pattern | High |
| 19 | Onboarding dashboard | Missing (only an empty state on the dashboard) | `DashboardPage.tsx` | No checklist | "Get started" card on the dashboard + `/app/onboarding` page from `GET /onboarding/status` | High |
| 20 | Progress tracking / save and resume | Partial: property wizard saves each step (`?step=`), draft property | `PropertyWizardPage.tsx` | No overall progress; profile not resumable | Progress computed on the server from real data (no stored percentage); every step saves on its own | High |
| 21 | Non-blocking verification | Done today: only `phone_not_verified` blocks | `OrgRolePermission`, `RequireAuth` | Must stay so; new checks could break it | Rule + tests: email, identity and property states never return 403 on operational endpoints | High |
| 22 | Publishing eligibility | Wrong: listing badge set by hand in Django admin, not linked to verification | `apps/listings/public.py::public_base`, `admin.py`, `ListingSerializer` | Publishing ignores owner and property checks | `publishing_eligibility(property)` service: property verified + owner verified (configurable); listing publish refused with a plain reason; public list uses it instead of the manual flag | High |

## 5. Things that block access today (checked)

| Check | Where | Blocks | Keep? |
|---|---|---|---|
| Mobile not confirmed | `core/permissions.py::PhoneNotVerified`, `guards.tsx::RequireAuth` | All business endpoints and screens | Yes (target: OTP before dashboard) |
| Business suspended | `core/tenancy.py::resolve_membership` (active organizations only) | Everything for that business | Yes (platform action, not verification) |
| Feature off / plan limit | `core/features.py`, `subscriptions/entitlements.py` | Single features | Out of scope, unchanged |
| Property readiness | `properties/services.py::status_change_problem` | Opening a property without rooms or beds | Yes (not verification) |
| Property verification | none | nothing | Correct |
| Email / identity | none | nothing | Must stay this way |

## 6. Architecture for Phase 2

- **Backend:**
  - New app `apps/onboarding` for consent, owner verification, the onboarding status service and publishing eligibility. It reuses `apps/verification` (SMS), `core.uploads`, `core.audit`, `core.notify` and the platform permission system.
  - Property verification stays in `apps/properties`.
- **Status model:** each check has its own field and history; nothing derives from another.

| Status | Values |
|---|---|
| Account | active / suspended (existing `is_active`, org status) |
| Mobile | confirmed / not confirmed (`phone_verified_at`) |
| Email | not added / waiting / confirmed (`email_verified_at`) |
| Owner identity | not started, draft, submitted, under review, more info needed, approved, rejected |
| Property | existing 5 states + under review |
| Listing | can publish / why not (computed) |

- **Frontend:**
  - New `features/onboarding/`: start (consent + mobile), profile, email confirm page, onboarding page, owner verification form.
  - The Platform portal gets an "Owner checks" page reusing the review layout.

## 7. Database impact (all through migrations)

| Change | Kind |
|---|---|
| `User.email_verified_at` | new nullable field |
| `ConsentRecord` | new table (global, per user) |
| `PhoneCode.user` nullable, or `SignupCode` | change / new table |
| `OwnerVerification`, `OwnerDocument`, `OwnerVerificationEvent` | new org-scoped tables |
| `Property.contact_phone`, `Property.reference` (+ backfill) | new fields + data migration |
| `Property.Verification.UNDER_REVIEW` | new choice |
| `PropertyClaim` | new table, only if Claim is approved |

Existing rows are untouched apart from the reference backfill. Existing owners get the email status "not added" or "waiting", and identity "not started".

## 8. API impact

| API | Change |
|---|---|
| `POST /auth/signup/start` | new: consent + mobile → sends OTP (same answer for known numbers) |
| `POST /auth/signup/confirm` | new: OTP → creates owner account + session |
| `PATCH /auth/me/profile` | new: name, email, business name |
| `POST /auth/email/send`, `POST /auth/email/confirm` | new |
| `POST /auth/login/mobile`, `…/confirm` | new, if decision D2 = mobile login |
| `GET /onboarding/status` | new: every status + next actions |
| `/owner-verification/` (GET, PATCH, documents, submit) | new |
| `/platform/owner-verifications/` (list, retrieve, decide, document download) | new, `p.verification.review` |
| `/platform/properties/{id}/verification/` | add `under_review` and claim |
| `POST /auth/register` | kept during transition, then removed |
| Listing create/update | refuse `is_published=true` when not eligible |

## 9. Security considerations

- Consent is stored with version, time, IP and user agent, and never overwritten (append-only).
- Starting sign-up answers the same way for a used or unused number. OTP limits and throttles are reused.
- The email link is signed, single-use and expires in 48 hours. Changing the email resets the status.
- Identity documents are private (`media/private/owner-documents/<org>/`) and are streamed only to the owner and the reviewer. Every download is audited.
- Only the last 4 digits of an ID number are stored. No Aadhaar OTP or biometrics, and no claim of government verification.
- Reviewers cannot review a business they belong to (already guaranteed: platform staff cannot be business members).
- Owners cannot change a decision. Decisions only come from `p.verification.review`.
- New endpoints are added to `role_access.json` and `platform_access.json`.

## 10. Implementation sequence (Phase 2, one step at a time, after approval)

1. Registration: consent + mobile-first OTP + account after OTP.
2. Owner profile + consent screens (Terms, Privacy, marketing in profile).
3. Email verification (non-blocking).
4. PG registration: contact number, reference, Claim Existing PG (if approved).
5. Owner identity verification (owner side).
6. Property verification: under review + notifications.
7. Platform review of owner checks.
8. Onboarding dashboard and progress.
9. Publishing eligibility.
10. Regression and acceptance tests, the e2e journey and docs.

## 11. Test cases

| Area | Tests |
|---|---|
| Registration | Terms or Privacy unticked → refused; marketing optional; OTP right/wrong/expired/5 tries; no account before OTP; same reply for a used number; throttle |
| Consent | Records version + time; withdrawing marketing adds a record and keeps history |
| Profile | Name/email update; duplicate email refused; business name optional → default |
| Email | Link confirms once; expired/reused/tampered refused; changing email resets; dashboard works while unconfirmed |
| Property | Required fields; reference unique; contact number format; claim flow (if built) |
| Owner verification | Draft save/resume; submit needs required documents; bad file type/size/signature refused; another business's documents → 404; owner cannot approve |
| Admin review | Only `p.verification.review`; approve / more info (note required) / reject (reason required); history; audit; notification sent |
| Non-blocking | With email, identity and property all pending: dashboard, properties, tenants and rent endpoints all 200 |
| Publishing | Not eligible → publish refused with reason; eligible → allowed; public list hides ineligible |
| Regression | Existing 569 backend tests, 134 frontend tests and the e2e journey stay green |

## 12. Decisions needed before Phase 2

- **D1:** Mobile-first sign-up replaces the current single form. Existing owners are unaffected.
- **D2:** How owners sign in later, since the target registration has no password. Options:
  - (a) Mobile + OTP (recommended), with email + password kept for existing accounts.
  - (b) Set a password in the profile step.
- **D3:** Claim Existing PG: what "existing" means. Options:
  - Properties created by the platform team.
  - Marketplace PGs.
  - A free-text claim that the platform team resolves.

  Recommended: a free-text claim with proof, resolved by the platform team.
- **D4:** Which owner identity documents are accepted. Recommended: PAN or a business registration document, Aadhaar only masked.
- **D5:** Publishing rule. Recommended: property verified + owner verified. The switch stays configurable per environment (`LISTINGS_REQUIRE_VERIFICATION`).
- **D6:** The legal text for Terms and Privacy, which you need to supply (I will add placeholders with a version number).
