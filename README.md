# pg-saas

Management software for PG and co-living operators in Bengaluru, with a public
marketplace where people find verified PGs, see them on a map and apply online.
The feature set is modelled on what PG platforms such as PG Buddy offer, built on our own stack.

```
backend/    Django REST API (Python 3.12+), SQLite locally, PostgreSQL in production
frontend/   React + TypeScript web app (Vite), works on phones and desktops
docs/       Architecture decisions
```

## What it does

| Area              | Features                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Properties        | Properties, rooms and beds; live vacancy; block, reserve, change rent per bed                                                                                                                                                                                                                                                                                                                                                                                                     |
| Amenities         | 14 categories in a database catalog (Django admin; `python manage.py sync_amenities` adds new ones), filtered by property type (PG, co-living, hostel, apartment, independent house, standalone building). Searchable picker; each amenity shows only its relevant details: shared/private, included/extra charge, quantity, selected rooms, meal times, parking type, Wi-Fi coverage… Grouped on the property page and public listing; marketplace filters come from the catalog |
| Tenants           | Profiles (ID type + last 4 only, consent recorded), check-in, deposit, notice, room transfer, checkout with deductions and refund                                                                                                                                                                                                                                                                                                                                                 |
| Agreements        | Notice period, lock-in, agreement end date, signed copy (PDF/photo) stored privately                                                                                                                                                                                                                                                                                                                                                                                              |
| Rent              | Monthly invoices (pro-rated by day for part months), extra charges, payments by UPI/cash/bank, printable receipts, overdue list, void                                                                                                                                                                                                                                                                                                                                             |
| Reminders         | Due and overdue rent list, one-tap WhatsApp message, email reminders, daily automatic emails (`send_rent_reminders`), at most one reminder per tenant every 3 days                                                                                                                                                                                                                                                                                                                |
| Expenses & profit | Expenses by category and property, rent in by payment mode, monthly profit/loss, monthly accounts CSV for the accountant                                                                                                                                                                                                                                                                                                                                                          |
| Staff & salaries  | Staff register (cook, warden, housekeeping…), monthly salary and pay day, "Pay salary" once per month, unpaid salaries flagged                                                                                                                                                                                                                                                                                                                                                    |
| Operations        | Complaints with assignee, status and what was done to fix them; notices                                                                                                                                                                                                                                                                                                                                                                                                           |
| Marketplace       | Search by area, locality, gender, sharing, budget, food and amenities; grid, list and map (price pins) views; photo galleries; Verified badge; enquiry form; report a listing; request a PG that isn't listed                                                                                                                                                                                                                                                                     |
| Room seekers      | Free account; owner's phone shown only to signed-in visitors; apply online; track applications; wishlist                                                                                                                                                                                                                                                                                                                                                                          |
| Applications      | Operator inbox: approve straight into a free bed (creates the tenant and check-in) or decline with a reason; the applicant is emailed                                                                                                                                                                                                                                                                                                                                             |
| Reports           | Dashboard (occupancy, collections, dues, complaints, leads), monthly collections CSV, activity log                                                                                                                                                                                                                                                                                                                                                                                |
| Team              | Owner adds managers and staff; staff never see money                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Not included yet:** online rent payment (payment gateway), SMS/OTP login, and sending
WhatsApp messages automatically. These need paid provider accounts; WhatsApp reminders open
WhatsApp with the message ready for the operator to send.

**Listing verification:** a new listing appears on the public marketplace only after the
platform team marks it verified (Django admin → Listings → "Mark verified"). Locally this check is
off (`LISTINGS_REQUIRE_VERIFICATION=false` in development), so you see your listings straight away.

## Run it locally

You need **Python 3.12+** and **Node.js 20.19+ or 22.12+** (`python3 --version`, `node --version`).
On a Mac: `brew install python@3.12 node@22`. Nothing else: the database is a local SQLite file.

### 1. Backend (terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements-dev.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(50))"
# paste the output after DJANGO_SECRET_KEY= in backend/.env

python manage.py migrate
python manage.py seed_demo          # optional: realistic demo data (see below)
python manage.py runserver          # http://127.0.0.1:8000
```

### 2. Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

Open **http://localhost:5173**. The frontend forwards `/api` to Django, so keep both running.

- Marketplace (public): http://localhost:5173/
- Operator app: http://localhost:5173/app — sign up, or with demo data sign in as
  `demo@example.com` / `Demo-Pass-2026`
- Room seeker: sign in as `seeker@example.com` / `Demo-Pass-2026` to see owners' numbers,
  applications and the wishlist
- API docs: http://127.0.0.1:8000/api/v1/docs/ · Django admin: http://127.0.0.1:8000/admin/
  (`python manage.py createsuperuser` first)

### Demo data

`python manage.py seed_demo` fills the local database with a realistic business:
4 PGs in HSR Layout, Koramangala, Bellandur and BTM Layout (49 beds, about 75% occupied),
37 tenants, past tenants with deposit refunds, 3 on notice, 3 months of rent with paid,
part-paid and overdue invoices, electricity charges, complaints, notices, 4 verified
listings with photos and map locations, 12 marketplace leads, 6 online applications (pending,
approved, declined), staff with salaries, 3 months of expenses and rent reminders.
Dates are relative to today, so it always looks current.

| Login (password `Demo-Pass-2026`)         | Role                                              |
| ----------------------------------------- | ------------------------------------------------- |
| `demo@example.com`                        | Owner (sees everything)                           |
| `priya@example.com`                       | Manager                                           |
| `raju@example.com`, `lakshmi@example.com` | Staff (no money screens)                          |
| `seeker@example.com`                      | Someone looking for a PG (applications, wishlist) |

`python manage.py seed_demo --fresh` wipes the **local** database and rebuilds the demo.
It only runs when `DJANGO_DEBUG=true`, so it cannot touch production.

**Updating from an earlier version?** Install the new package (Pillow) and run the new migrations
before starting the server, then rebuild the demo:

```bash
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py seed_demo --fresh
cd ../frontend && npm install        # adds the map library (Leaflet)
```

Uploaded photos and agreements are stored in `backend/media/` (not committed to git).
The map uses OpenStreetMap tiles, so it needs an internet connection.

### One-click start on a Mac

Double-click `start-backend.command` in Finder (installs packages, runs migrations, loads the
demo data once, starts Django), then `start-frontend.command` (installs packages, starts the web
app). If macOS warns about the script, right-click it → Open.

### Google Maps on the "Add property" form

Owners search the PG or a landmark, the address and pincode fill in, and they drag the pin
to the entrance. They can also paste a Google Maps link. Without a key the same form uses a
free OpenStreetMap map. To switch on real Google Maps:

1. In Google Cloud Console create a project, turn on billing (Google gives a monthly free
   credit), and enable **Maps JavaScript API**, **Places API (New)** and **Geocoding API**.
2. Create an API key. Under _Application restrictions_ choose _Websites_ and add
   `http://localhost:5173/*` (and your real domain later). Under _API restrictions_ allow only
   the three APIs above. The key is visible in the browser, so these restrictions matter.
3. Create `frontend/.env.local` with `VITE_GOOGLE_MAPS_API_KEY=<your key>` and restart
   `npm run dev`. (`.env.local` is ignored by git.)

Property photos (building, rooms, common areas) are added on the same form or on the property
page; they also appear first on the property's public listing.

### Automatic rent reminders

```bash
python manage.py send_rent_reminders   # emails tenants with rent due in 3 days or overdue
```

Run it once a day (cron, or your host's scheduler). Locally emails are printed in the terminal;
set the `EMAIL_*` variables in `backend/.env` to send real email.

**Next time:** `cd backend && source .venv/bin/activate && python manage.py runserver`, and in a
second terminal `cd frontend && npm run dev`.

## Checks

```bash
# backend (venv active)
cd backend
pytest --cov                         # 316 tests
ruff check . && ruff format --check .
mypy .

# frontend
cd frontend
npm run lint && npm run typecheck && npm run format:check
npm test                             # unit tests (Vitest, 83 tests)
npx playwright install chromium      # once
npm run test:e2e                     # full journey in a real browser, desktop + phone
```

`npm run test:e2e` starts its own Django server on a throwaway database (`backend/e2e.sqlite3`)
using the `python` on your PATH, so activate the backend venv first.

CI runs all of this on every pull request (`.github/workflows/`). Backend tests run on both
SQLite and PostgreSQL 16.

## When the API changes

The frontend's TypeScript types are generated from the backend's OpenAPI schema:

```bash
cd backend && python manage.py spectacular --file openapi.yml
cd ../frontend && npm run gen:api
```

CI fails if either file is out of date.

## Moving to PostgreSQL

```bash
docker compose up -d db               # or any PostgreSQL 16 server
# in backend/.env: DB_ENGINE=postgres and the POSTGRES_* values
python manage.py migrate
```

Production always runs on PostgreSQL; its settings refuse to start on SQLite.

## Production notes

Serve the built frontend (`npm run build` → `frontend/dist/`) and the Django API from the **same
domain** (for example a reverse proxy sending `/api/` and `/admin/` to Django and everything else
to `dist/index.html`). The login refresh cookie is `SameSite=Strict` and scoped to `/api/v1/auth/`,
so a separate API domain would need extra CORS and cookie settings.
