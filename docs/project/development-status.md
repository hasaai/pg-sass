# Development status (updated 2026-10-18, phase 1 of the Properties portal)

- Full development plan (living doc): https://claude.ai/code/artifact/47ef99cb-f396-4e73-81ab-b94d0b037c83
- Repo: ~/Desktop/pg-saas on San's Mac — byte-identical to the cloud repo at commit **a56deec** (+ this docs update) (verified by sha256 digest after each delivery). No .git on the Mac yet; San to `git init` + commit.
- San's Mac uses **Python 3.14.8**. Full suite verified on Python 3.14 (pip requirements).
- Cloud repo commits: e8d2114 foundation · 674a056 SQLite + pip requirements · 38600f1 backend MVP · d0017ff frontend + CI · d125045 richer demo data · 8d1b507 backend PG Buddy features · 33150fa frontend PG Buddy features.

## Round 3 (2026-10-18): "take https://www.pgbuddy.co.in/ as reference"
Reference read: pgbuddy.co.in home + /for-owners (pricing page unreadable). Built equivalents on our stack:
- Marketplace: grid/list/map (Leaflet + OSM tiles, lazy chunk) with price pins + "search this area" (bbox), amenity/food/availability chips, text search, photo galleries (Pillow-validated uploads, max 15), Verified badge (LISTINGS_REQUIRE_VERIFICATION: base/test True, local False; admin action "Mark verified"), report listing, request-a-PG, map pins rounded to ~100 m.
- Seekers: /signup (no org), owner phone only for signed-in users, apply online (consent, ID last 4), My applications (withdraw), wishlist. Login returns to `from` (same-site only); seekers land on /my.
- Operators: Applications inbox (approve into a vacant/reserved bed of the listing's property → tenant + stay; decline with reason; emails), listing photos manager, Expenses & profit (by category/mode, monthly CSV), Staff & salaries (Pay salary once per month), Rent reminders (WhatsApp wa.me links + log, email, `send_rent_reminders` daily command, 3-day gap), stay agreement terms + private agreement file, complaint resolution note, property lat/lng ("12.91, 77.64" paste).
- New deps: backend Pillow; frontend leaflet, react-leaflet, @types/leaflet.
- Bug fixed: CSV downloads sent `Accept: text/csv` only → DRF 406 (collections CSV was already broken). Now `text/csv, application/json;q=0.9`.
- Seed adds: verified listings with 3 generated photos + coordinates, 6 staff with salaries, 3 months of expenses (current month prorated), reminders, seeker@example.com + 5 applicants (pending/declined/approved), wishlist, PG request.
- Checks: 270 pytest on SQLite + PostgreSQL + Py3.14; ruff/mypy/makemigrations/spectacular clean; 60 Vitest; Playwright journey (operator → listing photo → visitor enquiry → seeker signup → apply → owner approves → expense/profit) passes desktop + Pixel 7.

## Round 4 (2026-10-18): property photos + Google Maps location (commit ea0ecab)
- San chose real Google Maps + shared photos. PropertyPhoto model (max 20) at /properties/{id}/photos/ (POST, owner/manager) and /property-photos/{id}/ (PATCH/DELETE); photos included in PropertySerializer; public listing photos = property photos then listing photos.
- Property form: LocationPicker (lazy). Google path (needs VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local; APIs: Maps JavaScript, Places (New), Geocoding; uses PlaceAutocompleteElement 'gmp-select', AdvancedMarkerElement with DEMO_MAP_ID default, Geocoder for pin drag) — NOT tested against real Google (no key; sandbox blocks googleapis). Fallback: Leaflet + Nominatim search/reverse. Paste Google Maps link parsing (!3d!4d, @lat,lng, ?q=/query=), short links rejected with guidance; use-my-location; Open in Google Maps.
- 278 pytest (SQLite/PG/Py3.14), 71 Vitest, e2e passes (property photo + Maps link step).
- Also added start-backend.command / start-frontend.command (double-click on Mac). San had hit `fields.E210 Pillow not installed` because pip install wasn't re-run after the update.

## Round 5 (2026-10-18): Amenities section (commit d4aee6d)
- New app apps/amenities: catalog.py (14 categories, ~75 canonical amenities, flags sharing/charge/quantity/rooms + typed attrs) → DB (AmenityCategory/Amenity, global, in GLOBAL_MODELS) via migration 0002 (also converts legacy Property.amenities words; unknown words kept) and `sync_amenities [--overwrite]`.
- PropertyAmenity (org-scoped): status available/unavailable (no row = not specified), sharing, charge included/extra + amount(paise)+period, quantity, level property/room + rooms M2M, details JSON, note. Bed-level not supported (beds have no attributes).
- Property.property_type (pg, coliving, hostel, apartment, house, building; default pg). Type change drops incompatible amenities (PropertySerializer.update).
- API: GET /amenities/ (public, ?property_type=, ?filterable=true), GET/PUT /properties/{id}/amenities/ (whole set, validated in services.validate_assignment; owner/manager PUT, all roles GET). Property.amenities = derived list of available keys (search filter unchanged; legacy words mapped).
- Frontend: AmenitiesSection (category sidebar/tabs, search incl. aliases, select all/clear, chips +N more, per-amenity details), PropertyForm saves property then PUT amenities (skips unchanged; maps per-item errors), AmenityGroups on property page + public listing; search chips from catalog.
- Checks: 316 pytest (SQLite/PG/Py3.14), 83 Vitest, e2e passes. seed_demo re-syncs catalog after --fresh flush.

## Round 6 (2026-10-18): Properties portal phase 1 — backend foundations (commit 90e20c1)
- San approved the architecture with all recommended decisions: Tailwind + shadcn/ui for the new
  property screens only; rooms may sit directly under a property; tenants will rent a bed, a room or a
  whole flat (tenancy change comes in phase 7); platform admins = Django staff; numbered pages in admin tables.
- New models Floor and RentalUnit (flat / portion); Room gains unit, floor (FK), room type, letting
  (whole / by_parts) and rent when rented whole; archived_at on floors, units, rooms, beds.
- Property gains status (draft "Not finished" / active "Open" / inactive "Closed" / archived "Removed"),
  verification_status, building name, description, state, total floors, area, year built. is_active is
  derived from status. API-created properties start as draft; houses get a "Whole house" unit.
- Endpoints: /floors/, /units/ (CRUD + archive/restore), rooms/beds archive/restore,
  /properties/{id}/readiness/, /inventory/, activate/deactivate/archive/restore, /properties/bulk/
  (all or nothing). /properties/ now uses numbered pages (count) with q, status, verification_status,
  property_type, locality and ordering. Every status/choice has a *_label in plain words.
- Check-in refuses removed beds and beds inside a room or flat rented whole.
- Migrations 0005–0007 copy existing data (is_active → status, verified listing → verified,
  free-text floors "1"/"G" → Floor records, sharing 1 → private room). Tested on an old demo DB.
- UI (interim, until the new portal screens): status card on the property page with what is left and
  an "Open property" button; room floor entered as a number and shown as "1st floor".
- Seed adds Maple Residency (building, 4 flats incl. one rented room by room) and Banyan Villa (house).
- Checks: 356 pytest on SQLite, PostgreSQL and Python 3.14; ruff, mypy, makemigrations --check,
  spectacular --validate clean; 86 Vitest; lint, typecheck, prettier, build clean; Playwright journey
  passes on desktop and Pixel 7. Google Maps still untested against real Google.
- Next: phase 2 (app shell + Tailwind/shadcn design system), then list/dashboard, wizard, inventory screens.

## Round 7 (2026-10-18): enterprise UI for property management (commit a56deec)
- San: the UI did not look like an enterprise SaaS; options must follow the property type; rooms must be editable.
- New design system (approved decision 1): Tailwind 4 + shadcn-style components on Radix (src/components/ui-kit),
  Lucide, React Hook Form + Zod, sonner. CSS layers keep older screens working (legacy layer, data-slot rule).
- App shell for all operator pages: grouped collapsible sidebar, breadcrumbs, org switcher, Ctrl+K property search,
  account menu, mobile drawer. Operator app lazy-loaded (public bundle 418 kB).
- Properties list (summary cards, status tabs, search, type filter, sort, pages, bulk actions), 5-step add/edit
  wizard driven by src/features/properties/propertyTypes.ts, property page with tabs (Overview, Flats/Portions,
  Rooms & beds, Photos), dialogs to add/edit/remove flats, rooms, beds and floors.
- Fixed: PhotoManager did not refresh the property page after an upload (exact query keys).
- Checks: 358 pytest (SQLite, PostgreSQL, Py3.14); ruff/mypy/makemigrations/spectacular clean; 97 Vitest; lint,
  typecheck, prettier, build clean; Playwright journey passes desktop + Pixel 7. Screenshots reviewed.
- On the Mac: run `npm install` in frontend (new packages). Five replaced files were moved to pg-saas/_to_delete/.
- Next: move tenants, rent and the dashboard onto the new design; tenancy on whole rooms/flats (phase 7).

## Round 8 (2026-10-18): logos, property documents, verification, platform admin portal (commit 3d85efc)
- San asked for a PG logo, a place to store property documents, and an admin tool for all features.
  Choices: business logo + per-property logo; standard document set + "Other"; a platform admin portal.
- Logos: business logo (Settings, sidebar, rent receipts) and property logo (property page, list, wizard step
  "Logo & photos"). Public images under media/public/logos/.
- Property documents tab: sale deed/khata, rental agreement, management authorisation, trade licence, fire NOC,
  police verification, electricity/water bill, insurance, other. Private files, owners/managers only, every
  download audited, expiry dates with "Expires soon" / "Expired" warnings (30 days).
- Verification: owner sends a property for checking once a proof document is uploaded; the platform team
  verifies, asks for changes or does not approve (note required); history shown to both sides. Changing a proof
  document of a verified property sends it back to "Being checked".
- Platform admin portal at /platform (Django staff only): overview, businesses (search, detail, suspend with a
  reason / reactivate, switch features on/off), verification queue, all properties, users (deactivate), amenity
  catalog, activity. Switchable features: reminders, expenses & profit, staff & salaries, complaints, notices,
  marketplace (off unpublishes listings). API refuses switched-off features (403 feature_disabled).
- New Settings page on the new design. `python manage.py create_platform_admin --email … --name …`
  (password from PLATFORM_ADMIN_PASSWORD or prompt). Demo: admin@example.com / Demo-Pass-2026.
- Checks: 385 pytest (SQLite, PostgreSQL, Py3.14); ruff/mypy/makemigrations/spectacular clean; 104 Vitest;
  lint, typecheck, prettier, build clean; Playwright journey (incl. document upload → admin verifies) passes
  desktop + Pixel 7. Mobile overflow checked on 15 pages at 412 px.
- On the Mac: no new packages. Run migrate and seed_demo --fresh. Old pages/app/SettingsPage.tsx moved to
  pg-saas/_to_delete/.
- Gaps: property type label differs slightly between backend ("PG accommodation") and wizard ("PG (paying
  guest)"); some activity words are auto-generated ("Salary pay"); no email/SMS reminder when documents expire.

## Round 9 (2026-10-18): tenant plan, then tenants on the new design (phase T1)
- Plan first: "Tenant Management: Plan & Options" Claude Doc (other apps compared, verification options,
  privacy, 5-step tenant sign-up, phases T1–T4). San's decisions: order T1→T4; warn but don't block
  check-in without ID check; manual ID photos + selfie first, DigiLocker later; police verification as a
  tracked step (owner files on Seva Sindhu); no agreement step; private 7-day joining link; ID photos
  deleted 90 days after move-out. "Go with proper flow" → started T1.
- A stay now rents a bed, a whole room or a whole flat/portion (approved decision 3 of the property
  plan). Stay.property is always set (migrations 0003–0005 fill it for existing stays; tested on an old
  demo database with 42 stays). Free places endpoint for the picker. Invoices, reminders, receipts,
  dashboard and reports show "Flat 101 · Whole flat" style labels.
- New tenant screens (src/features/tenants): list with counts, status tabs (Staying / Leaving soon /
  Not checked in / Moved out), search, property filter, sort, pages; tenant page with Overview, Rent and
  Stays tabs; one-screen "Add tenant" with optional "Check in now"; dialogs to check in, move, record
  notice, collect deposit, check out with deductions, and edit stay terms. New fields: date of birth,
  home address. Demo data adds a whole-flat and a whole-room tenant at Maple Residency.
- Checks: 412 pytest (SQLite, PostgreSQL, Py3.14); ruff/mypy/makemigrations/spectacular clean; 110
  Vitest; lint, typecheck, prettier, build clean; Playwright journey (add + check in on one screen)
  passes desktop + Pixel 7; screenshots checked at 1366 px and 412 px (no sideways scrolling).
- On the Mac: no new packages. Run migrate (3 tenant migrations) and seed_demo --fresh. The old tenant
  pages were moved to pg-saas/_to_delete/.
- Next: T2 (joining link + 5-step sign-up, ID photos + selfie, police verification tracker).
- Gaps: property list occupancy still counts beds only (whole rooms/flats let are not in "beds filled");
  marketplace approval still gives a bed only.

## Round 10 (2026-10-18): room features and "beds never more than sharing"
- Checked first: the amenity catalog already had Balcony as a room-level amenity, but the Add a room
  form only had AC and attached bathroom, and nothing stopped a 2-sharing room getting a 3rd bed.
- Room form: "More in this room" list from the catalog (bed, mattress, wardrobe, study table, fan,
  TV, balcony, geyser, western toilet …), each "In rent" or "Extra" with a monthly amount per tenant.
  San chose: extras are added to the rent bill (own line, pro-rated like rent). Room cards show
  "Balcony +₹500"; the free-place picker shows the extra too.
- Beds never exceed sharing: adding or restoring a bed in a full room is refused, sharing cannot go
  below the beds a room has, "Add bed" is disabled on full rooms ("All 2 beds added (2 sharing)").
- Checks: 430 pytest (SQLite, PostgreSQL, Py3.14); ruff/mypy/makemigrations/spectacular clean; 112
  Vitest; lint, typecheck, prettier, build clean; Playwright journey (balcony extra, full room) passes
  desktop + Pixel 7.
- On the Mac: run migrate (properties 0009) and seed_demo --fresh. Existing rooms that already have
  more beds than sharing keep them; only new beds are refused.

## Run (San's Mac, after this update)
backend: cd backend; source .venv/bin/activate; pip install -r requirements-dev.txt; python manage.py migrate; python manage.py seed_demo --fresh; python manage.py runserver
frontend: cd frontend; npm install; npm run dev → http://localhost:5173 (proxies /api and /media to :8000).
Logins (Demo-Pass-2026): demo@ owner, priya@ manager, raju@/lakshmi@ staff, seeker@example.com seeker, admin@example.com platform admin (/platform).

## Environment notes for future sessions
- Registries only via agent proxy: source scratchpad env: NO_PROXY=localhost,127.0.0.1 no_proxy=… npm_config_noproxy=localhost,127.0.0.1 UV_SYSTEM_CERTS=1, unset UV_NATIVE_TLS. `uv venv -p 3.14` + `uv pip install -r requirements-dev.txt` tests San's version.
- Postgres role `pgsaas`/`pgsaas` (CREATEDB). After a container restart: `service postgresql start` and re-create the role if auth fails.
- Playwright: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium E2E_PYTHON=<backend>/.venv/bin/python. OSM tiles are blocked in the cloud sandbox (grey map, pins still render).
- Delivery: device mount is $HOME/mnt/Desktop; files via device_commit_files with stagedPath under /mnt/user-data/outputs (≤50/call). `.github/` and SVGs via device_bash base64. Check device hashes vs last delivered commit first; verify with a sorted (LC_ALL=C) sha256 digest after.
- Don't `pkill -f pattern` in the same Bash line containing the pattern. Never `git checkout <old> -- .`.
- Tests that call `flush` need `@pytest.mark.django_db(transaction=True)` on PostgreSQL.

## Known gaps / next
- Deferred (need provider/decision): payment gateway (online rent), SMS/OTP, automatic WhatsApp sending (Business API), tenant self-service portal, offline PWA, password reset UI, GST invoices, late-fee automation.
- Listing reports and PG requests are still reviewed in Django admin (not yet in /platform).
- Reminders list shows one row per unpaid invoice (a tenant with 2 unpaid months appears twice).
- Map tiles use the public OSM tile server — fine for development; production should use a tile provider with an API key (usage policy).
- Idempotency race: two simultaneous requests with the same new key → second gets 500; fix by catching IntegrityError.
