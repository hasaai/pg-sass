# PG Management SaaS

Multi-tenant SaaS for PG and co-living operators, launching in one Bengaluru
locality, with a public listing marketplace. Full plan: the "PG Management SaaS:
Development Plan" doc in the FirstStartup Claude project.

## Stack
- Frontend: React 19 + TypeScript + Vite (`frontend/`), React Router 7, TanStack Query.
  Operator app design system: Tailwind CSS 4 + shadcn/ui-style components on Radix
  (`src/components/ui-kit/`), Lucide icons, React Hook Form + Zod, sonner toasts.
  Screens not yet moved keep the older `styles.css` (the `legacy` CSS layer).
- Backend: Django 5.2 + Django REST Framework (`backend/`)
- Database: SQLite for local development (default), PostgreSQL 16 for production;
  switch with `DB_ENGINE=postgres`. CI tests both. Avoid database-specific SQL.
- API: versioned REST under `/api/v1/`; OpenAPI schema at `/api/v1/schema/`

## Architecture rules
- Keep frontend and backend separately organized.
- One Django app per business domain under `backend/apps/`; shared plumbing in `backend/core/`.
- Organization-level data isolation is enforced on the server:
  - every business model inherits `core.models.OrgScopedModel` (a test fails otherwise);
  - every org-scoped endpoint uses `core.views.OrgScopedViewSet` / `OrgScopedAPIView`
    and names a permission per action (`permission_map`, or `view_permission` /
    `manage_permission` on model viewsets); an action without one is refused;
  - the organization comes from the user's membership (+ `X-Organization` header), never the body;
  - objects in another organization return 404.
- Permissions (RBAC): `core/access.py` is the only list of business permissions and what
  each role (owner, manager, accountant, staff = "Caretaker") gets. A person's access =
  role + `Membership.extra_permissions` - `removed_permissions`; an owner always has all.
  Check with `core.access.has_permission(membership, "rent.view")`, never `role in …`.
  `core/tests/role_access.json` is the reviewed contract of who may call every endpoint;
  `test_access.py` fails on any change, so access changes are always deliberate.
- Property access: `Membership.properties` (empty = all; an owner always all). Every org-scoped
  queryset goes through `core.access.limit_to_properties` (base viewsets and
  `OrgScopedRelatedField` do it for you); aggregate views use `core.access.visible(Model,
  request)`, never `Model.objects.for_org(...)`. A new business model must be listed in
  `PROPERTY_PATH` or `BUSINESS_WIDE` (a test fails otherwise). Tenants are seen through their
  stays (not yet checked in = seen by all). Only people with all properties can add a property.
- Team access is changed only through `organizations.services.update_access` (role, full tick
  list, property ids): nobody changes themselves, gives more than they have, or edits an owner
  unless they are one; every change is audited as `member.access`. The Team screen reads roles
  and ticks from `GET /members/access-choices/`. In React use `useAuth().can('rent.view')`
  (`src/auth/permissions.ts`) and `<RequirePermission perm=…>`, never role names.
- Business rules live in `services.py`, not in views or serializers.
- Money is integer paise. IDs are UUIDs.
- Platform-level records (listing reports, PG requests, wishlists, the amenity catalog) are the only models that
  are not org-scoped; they are listed in `core/tests/test_core.py::GLOBAL_MODELS`.
- Uploads go through `core.uploads.validate_upload` (size + content sniffing). Listing photos
  live under `media/public/`; agreements under `media/private/` and are only streamed by an
  authenticated, org-scoped endpoint. Never serve `media/private/` directly.
- Amenities: the catalog (`apps/amenities/catalog.py` → DB via migration / `sync_amenities`) is
  the only list of amenities; never hard-code one in React. Assignments are saved with
  `PUT /properties/{id}/amenities/` (whole set). `Property.amenities` is a derived list of
  available keys kept by `apps.amenities.services`; do not write it directly.
- Property inventory: Property → optional Floor → optional RentalUnit (flat / portion) →
  optional Room → optional Bed. A unit or room is rented `whole` or `by_parts`; rent sits only
  on the level that is rented. Rules (readiness, status changes, archiving, letting checks)
  live in `apps/properties/services.py`. Property status changes only through the
  activate / deactivate / archive / restore actions; `is_active` is derived from `status`.
  Inventory with history is archived (`archived_at`), never deleted.
  A room never has more live beds than its `sharing` (adding/restoring a bed or lowering
  sharing is refused). Room features (`RoomFeature`: balcony, geyser …) come from catalog
  amenities with `supports_rooms` (`GET /rooms/feature-choices/`), are saved as the room's
  whole `features` list, and an "extra" feature adds a line to every rent bill of a tenant in
  that room (`properties.services.room_extras`). Bulk add rooms + beds with
  `POST /properties/{id}/rooms-import/` (CSV; `commit=false` checks, `commit=true` adds all or
  nothing), see `apps/properties/room_import.py`. The CSV also takes one column per room amenity
  (catalog name or key: `yes` = included, an amount in rupees = extra charge per month); the
  template comes from `GET /properties/rooms-import-template/`. The Rooms & beds screen's "Add
  rooms" panel (one room or a range like 101 to 110) sends a small CSV to the same endpoint.
- A stay (`Stay`) rents exactly one place: a bed, a whole room (`room`, letting `whole`) or a
  whole flat / portion (`unit`, letting `whole`); `Stay.property` is always set, so filter on
  it, never on `bed__room__property`. Show places with `apps/tenants/places.py`
  (`place_label`, "Flat 302 · Whole flat"). What a tenant can move into is
  `GET /stays/free-places/?property=` (`tenants.services.free_places`).
- Property documents (`PropertyDocument`) are private files under `media/private/`, streamed
  only by `/property-documents/{id}/download/` (owners and managers) or
  `/platform/documents/{id}/download` (platform staff); every download is audited. Changing a
  proof document of a verified property sends it back to "Being checked".
- Logos (business and property) are public images under `media/public/logos/`.
- Platform admin API (`apps/platform`, `/api/v1/platform/…`) is the only cross-business code:
  `IsPlatformAdmin`, never org scoping or the X-Organization header. Its changes are written to
  the affected business's audit log. Create accounts with
  `python manage.py create_platform_admin --email … [--role …]` (password from the environment).
- Platform team roles: `apps/platform/access.py` is the only list of platform permissions
  (`p.…`) and roles (Platform owner = everything, Finance admin, Support agent, Verification
  reviewer). A team member is `is_staff` + a `PlatformStaff` row (role + extra/removed ticks);
  `is_staff` alone opens nothing. Every platform view names `platform_permission_map`
  (action/method → code, a tuple = any of them); a missing entry is refused.
  `apps/platform/tests/platform_access.json` is the reviewed contract. Team changes go through
  `apps/platform/staff.py` (not yourself, not more than you have, owners only by owners, one
  Platform owner always remains, no one who works in a business) and are logged as
  `PlatformEvent`. React: `useAuth().canPlatform('p.users.view')`, `<RequirePlatformPermission>`.
- Feature switches: `core/features.py`; a view opts in with `feature = "<key>"` and
  `OrgRolePermission` refuses it with 403 `feature_disabled`. Keep the frontend list in
  `src/components/shell/features.ts` in step.
- Membership plans (`apps/subscriptions`): a `Plan` holds limits (properties, rooms, beds,
  tenants, team), features and monthly allowances; the list of what a plan can control is
  `apps/subscriptions/catalog.py`. Each business has one `Subscription` (new ones get a 14-day
  Pro trial; an ended plan falls back to Free). Check limits and paid features only through
  `apps/subscriptions/entitlements.py` (`check_can_add(org, "beds", n)` → 403 `plan_limit`,
  `check_feature` → 403 `feature_disabled`); `disabled_features` in `/auth/me` is computed from
  the plan plus the platform switch-off. A downgrade never deletes or blocks existing data; it
  only stops adding more.
- Plan payments: `apps/subscriptions/gateways.py` (Razorpay, Cashfree; Paytm listed but needs an
  approved crypto library). Standard library only. Keys come only from env (`RAZORPAY_*`,
  `CASHFREE_*`, `APP_BASE_URL`); `rzp_test_` / `CASHFREE_ENV=sandbox` mean test mode. The plan
  changes only after the server verifies the payment (signature or gateway lookup) in
  `/plan/confirm/` or the signed webhook `/payments/webhooks/<code>/`; `services.apply_payment`
  is idempotent.
- Owner sign-up (`apps/onboarding`, approved 2 Nov 2026): `/register` = tick Terms + Privacy
  (+ optional marketing) -> mobile -> 6-digit code (`POST /auth/signup/start|finish`; a code is
  sent before any account exists, `PhoneCode.user` empty, purpose `signup`) -> account made
  (an existing account with that number is signed in instead; replies never show whether a
  number is known) -> `/register/profile` (`PUT /onboarding/profile`: name, email, optional
  business name; makes the business + owner membership on first save) -> dashboard. Consent is
  append-only `ConsentRecord` with `TERMS_VERSION` / `PRIVACY_VERSION`. Email confirmation
  (`User.email_verified_at`, signed 48-hour link, `/confirm-email`) NEVER blocks anything; the
  dashboard only shows a reminder. Sign-in: mobile + code (`/auth/login/mobile/*`, default tab)
  or email + password. `RequireAuth` sends a signed-in person with no business to the profile
  step. The old one-form `POST /auth/register` is kept only for existing tests.
- Owner identity check (`apps/onboarding/owner_checks.py`, `/app/owner-verification`, permission
  `owner.verification`, owner only): ID type (PAN, masked Aadhaar, passport, driving licence,
  voter ID), last 4 characters only, name on ID, private files under
  `media/private/owner-documents/<org>/` (downloads audited). Not started -> Not sent yet ->
  Sent for checking -> Being checked -> Verified / Not approved / More information needed
  (editable again). Locked while sent. Never collect Aadhaar OTP/biometrics or the full
  number; never call it government verification. It never blocks the app; only public
  publishing may depend on it. Properties have `reference` (unique `PG-XXXXXX`, read-only) and
  an optional `contact_phone`.
- Mobile verification (`apps/verification`): owners give a mobile at sign-up and type a 6-digit
  code before any business endpoint works (`OrgRolePermission` → 403 `phone_not_verified`;
  frontend sends them to `/verify-mobile`). Our app makes and checks the code (hash only,
  10 minutes, 5 tries, resend after 60 s, 5 a day per number); SMS gateways in `sms.py`
  (APITxT = the default, first and on; Test/Terminal, 2Factor, Fast2SMS) only deliver it, tried in the order set on
  Platform → SMS gateways, falling back to the next; the Test gateway is used only when no
  real one is on. Gateway keys are typed on that page (stored encrypted with
  `core.secret_box`, `cryptography` Fernet, key `SECRETS_KEY` or derived from
  DJANGO_SECRET_KEY) or set in `.env` (`APITXT_*`, `TWOFACTOR_*`, `FAST2SMS_*`); a typed value wins. The
  API never returns a key, only "ending …1234". `SMS_TEST_CODE` fixes the code, DEBUG only
  (e2e). Test users from `UserFactory` are already confirmed.
- Product priority: SaaS operations first. The public marketplace pages (search, listing page,
  seeker sign-up, My applications, wishlist, request a PG) were removed from the frontend on
  2026-11-02 and will be redesigned later; their backend API and data are kept. `/` is the
  landing page (`src/features/landing/`: features + sign-in options for owners and their team,
  tenants (coming soon) and the PG Manager team).
- Public marketplace views use `core.auth.OptionalJWTAuthentication`: a bad token means anonymous.
- Schema changes only through migrations; `makemigrations --check` runs in CI.
- Never commit credentials or production data. Config comes from environment variables.
- Do not add dependencies without explaining why. No microservices without an approved need.

## Testing rules
Every endpoint gets tests for: success, validation failure, wrong role, and
another organization (`core.tests.support.assert_isolated` must return 404 for
GET/PATCH/DELETE).

## Dependencies
`pyproject.toml` + `uv.lock` are the source of truth. After changing them, regenerate
the pip files: `uv export --no-dev --no-hashes --no-emit-project --format requirements-txt -o requirements.txt`
(and `--only-dev` for `requirements-dev.txt`, which starts with `-r requirements.txt`).

## Wording rules
- Every word on screen must be understood by ordinary PG owners and staff: "Not finished",
  "Bed by bed", "Whole flat", "2 sharing" — never model names (`RentalUnit`, `Stay`) or raw
  codes. The API sends a `*_label` beside each status/choice code; screens show the label.
- Error messages say what is wrong and what to do ("Room 204 is rented bed by bed but has
  no beds."). Glossary: docs/architecture/properties-portal-architecture.md.

## Frontend rules
- API types come only from `src/api/schema.d.ts` (generated: `npm run gen:api` after
  `python manage.py spectacular --file openapi.yml`); aliases live in `src/api/types.ts`.
- All HTTP goes through `src/api/client.ts` (in-memory access token, refresh cookie, ApiError).
- Money is paise everywhere; convert only at the edge with `lib/format.ts` (`rupeesToPaise`, `formatMoney`).
- Role checks in the UI are convenience only; the API enforces them.
- New screens need a Vitest test for logic and, for main journeys, a step in `e2e/journey.spec.ts`.
- New operator screens use `src/components/ui-kit` + Tailwind and live in `src/features/<area>/`
  (properties, tenants, settings, platform so far);
  the app shell is `src/components/shell/AppShell.tsx` (pages set breadcrumbs with `useBreadcrumbs`).
- Property-type differences (questions asked, "Flat"/"Portion" wording, tabs) come from
  `src/features/properties/propertyTypes.ts`; add a field there rather than new type checks.
- Design system (Nov 2026 redesign): `frontend/docs/design-system.md` – tokens in
  `src/index.css` (jade brand, cool neutrals, Geist), patterns for pages, tables, forms, empty
  and loading states. Every screen uses ui-kit + Tailwind; no screen uses the old `styles.css`
  classes any more (they remain only inside AmenitiesSection, LocationPicker and PhotoManager),
  and the shell no longer applies the `legacy` wrapper.
- CSS layers: theme, base (Tailwind reset), legacy (`styles.css`), components, utilities. Old
  element rules (h1, a, p, focus) apply only inside `.legacy`; old control rules skip elements
  with `data-slot` (all ui-kit controls and the ui-kit Table set it).

## Commands (from `backend/`)
```
uv sync                                   # install
uv run python manage.py migrate
uv run python manage.py runserver
uv run pytest --cov                       # tests (SQLite by default)
uv run ruff check . && uv run ruff format --check .
uv run mypy .
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py seed_demo         # local demo data (DEBUG only)
```

## Commands (from `frontend/`)
```
npm install && npm run dev                # http://localhost:5173 (proxies /api to :8000)
npm run lint && npm run typecheck && npm test
npm run test:e2e                          # needs the backend venv active (or E2E_PYTHON)
```

## Workflow
1. Read the relevant requirements and existing code.
2. Propose a small implementation plan.
3. Implement one feature at a time.
4. Add tests for success, failure and permission cases.
5. Run tests, linting and type checks.
6. Summarize changed files, test results and remaining risks.
7. Stop and report any failing checks; never claim unrun tests passed.
