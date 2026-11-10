# PG Owner Onboarding: File Impact Matrix (Phase 1)

This plan follows `docs/pg-owner-onboarding-gap-analysis.md`. It is analysis only; nothing has been changed yet. "Reuse" means used as is. "Modify" means a small, scoped change. "New" means a new file.

## Backend: reuse as is

| File | Used for |
|---|---|
| `backend/apps/verification/services.py` (`send_code`, `confirm_code`, `deliver`, limits) | All OTP sending and checking |
| `backend/apps/verification/sms.py` | APITxT / 2Factor / Fast2SMS delivery |
| `backend/core/uploads.py` (`validate_upload`, `sniff_type`) | Owner identity documents |
| `backend/core/audit.py` | Audit of consent, verification and downloads |
| `backend/core/notify.py` (`email`) | Email verification links and decision emails |
| `backend/core/tenancy.py`, `core/views.py`, `core/permissions.py` | Business scoping and permissions for new endpoints |
| `backend/apps/platform/permissions.py`, `access.py` (`p.verification.review`, `p.documents.download`) | Reviewer access to owner checks |
| `backend/apps/organizations/services.py::create_organization_with_owner` | Business + owner membership + trial |
| `backend/apps/properties/models.py::PropertyDocument`, `VerificationEvent` | Property proof and history |

## Backend: modify

| File | Change | Why |
|---|---|---|
| `backend/apps/accounts/models.py` (`User`) | Add `email_verified_at` | Email status |
| `backend/apps/accounts/views.py`, `serializers.py`, `urls.py` | Add signup start/confirm, profile update, email send/confirm, optional mobile login; keep `RegisterView` during transition | Mobile-first registration |
| `backend/apps/verification/models.py` (`PhoneCode`) | `user` nullable (or new `SignupCode`) | OTP before account |
| `backend/apps/verification/services.py` | `send_signup_code(phone)`, `confirm_signup_code(phone, code)` reusing the limits | Same rules, no user yet |
| `backend/apps/properties/models.py` (`Property`) | `contact_phone`, `reference`; `Verification.UNDER_REVIEW` | Basic details, unique ID, review state |
| `backend/apps/properties/services.py` | `decide_verification` sends email; `start_review` | Notifications, under review |
| `backend/apps/platform/views.py`, `urls.py` | Property review "start review"; owner check endpoints | Admin review |
| `backend/apps/listings/serializers.py`, `public.py` | Use `publishing_eligibility` | Publishing rule |
| `backend/apps/accounts/serializers.py::MeSerializer` | Add `email_verified`, `onboarding` summary | Frontend status |
| `backend/core/access.py` | New permission `owner.verification` (owner only by default) | Who may submit owner checks |
| `backend/core/tests/role_access.json`, `apps/platform/tests/platform_access.json` | Regenerated for new endpoints | Access contract |
| `backend/config/settings/base.py` | `TERMS_VERSION`, `PRIVACY_VERSION`, `EMAIL_LINK_HOURS` | Config, no secrets |

## Backend: new

| File | Contents |
|---|---|
| `backend/apps/onboarding/__init__.py`, `apps.py` | New app (registered in `INSTALLED_APPS`) |
| `backend/apps/onboarding/models.py` | `ConsentRecord`, `OwnerVerification`, `OwnerDocument`, `OwnerVerificationEvent`, `PropertyClaim` (if D3 approved) |
| `backend/apps/onboarding/services.py` | consent, owner verification state machine, `onboarding_status`, `publishing_eligibility` |
| `backend/apps/onboarding/serializers.py`, `views.py`, `urls.py` | Owner API and platform API |
| `backend/apps/onboarding/migrations/0001_initial.py` | New tables |
| `backend/apps/properties/migrations/00xx_contact_reference.py` | New fields + reference backfill |
| `backend/apps/accounts/migrations/00xx_email_verified.py` | New field |
| `backend/apps/onboarding/tests/test_signup.py`, `test_email.py`, `test_owner_verification.py`, `test_platform_review.py`, `test_non_blocking.py`, `test_publishing.py` | Tests from the gap analysis section 11 |

## Database models

| Model | Status |
|---|---|
| `accounts.User` | Extend (`email_verified_at`) |
| `verification.PhoneCode` | Extend (nullable user) or keep and add `SignupCode` |
| `organizations.Organization`, `Membership` | Reuse unchanged |
| `properties.Property` | Extend (`contact_phone`, `reference`, new choice) |
| `properties.PropertyDocument`, `VerificationEvent` | Reuse |
| `listings.Listing` | Reuse; `is_verified` no longer the only gate |
| `onboarding.ConsentRecord` | New (global, listed in `GLOBAL_MODELS`) |
| `onboarding.OwnerVerification`, `OwnerDocument`, `OwnerVerificationEvent` | New (org-scoped, `BUSINESS_WIDE`) |
| `onboarding.PropertyClaim` | New, only if D3 approved |

## Frontend: reuse

| File | Used for |
|---|---|
| `frontend/src/pages/auth/VerifyMobilePage.tsx` | OTP entry pattern (code box, resend timer) |
| `frontend/src/features/properties/PropertyWizardPage.tsx` | Add New PG (unchanged steps) |
| `frontend/src/features/properties/detail/DocumentsTab.tsx` | Property proof upload |
| `frontend/src/features/platform/PropertyReviewPage.tsx` | Layout for the owner check review |
| `frontend/src/components/ui-kit/*`, `auth/AuthContext.tsx`, `auth/guards.tsx` | UI and session |

## Frontend: modify

| File | Change |
|---|---|
| `frontend/src/pages/auth/RegisterPage.tsx` | Becomes the mobile-first start: consent ticks + mobile, then OTP |
| `frontend/src/App.tsx` | Routes: `/register/profile`, `/confirm-email`, `/app/onboarding`, `/app/owner-verification`, `/platform/owner-checks`, `/terms`, `/privacy` |
| `frontend/src/pages/app/DashboardPage.tsx` | "Get started" progress card |
| `frontend/src/features/platform/PlatformShell.tsx` | Menu item "Owner checks" |
| `frontend/src/features/landing/LandingPage.tsx` | "Register my PG" → new start |
| `frontend/src/api/schema.d.ts` | Regenerated |
| `frontend/e2e/journey.spec.ts` | New registration steps + owner check |

## Frontend: new

| File | Contents |
|---|---|
| `frontend/src/features/onboarding/StartPage.tsx` | Consent + mobile + OTP |
| `frontend/src/features/onboarding/ProfilePage.tsx` | Name, email, business name |
| `frontend/src/features/onboarding/ConfirmEmailPage.tsx` | Email link landing |
| `frontend/src/features/onboarding/OnboardingPage.tsx` | Status list and next actions |
| `frontend/src/features/onboarding/OwnerVerificationPage.tsx` | ID details + documents, save, submit, feedback, history |
| `frontend/src/features/onboarding/LegalPage.tsx` | Terms / Privacy (versioned text) |
| `frontend/src/features/platform/OwnerChecksPage.tsx`, `OwnerCheckReviewPage.tsx` | Reviewer queue and decision |
| `frontend/src/features/onboarding/onboarding.test.tsx` | Unit tests |

## Not touched (out of scope)

`apps/tenants`, `apps/billing`, `apps/finance`, `apps/operations`, `apps/reports`, `apps/subscriptions` (plans and payments), `apps/amenities`, `apps/applications`, and their screens. The one exception is shared files listed above that need a few added lines (routes, menu, settings).
