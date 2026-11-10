# PG Manager – UI/UX prototype

A clickable prototype of the whole PG Manager app with sample Bengaluru data and no backend.
Use it to agree on every screen before building it for real in `frontend/` and `backend/`.

## Open it
- **Quickest:** double-click `PG-Manager-prototype.html` (one file, works offline).
- **While changing screens:** `npm install` once, then `npm run dev` and open http://localhost:5180.

Use the **Viewing as** button (bottom right) to see the app as the Owner, Manager, Accountant,
Caretaker, the PG Manager team, or a Tenant. **All screens** in that menu lists every page.
"Reset sample data" puts everything back. Changes are kept only until you reload the page.

## What is inside (77 screens)
| Area | Screens |
|---|---|
| Website & sign-in | Home page, sign in (mobile code / email), register, about you, forgot password, confirm email, terms, privacy |
| Business basics | Dashboard, get started checklist, verify identity, settings (7 tabs), team & access, plan & checkout, activity log, notifications, help |
| Properties | List, add/edit property wizard, property page (overview, rooms & beds, tenants, amenities, photos, documents, verification, settings) |
| Tenants & rent | Tenants list, check-in wizard, tenant profile (move, notice, check out), rent & bills, bill page, payments & receipts, reminders, deposits |
| Daily work | Complaints board and detail, notices, expenses, reports & profit, staff & salaries, staff profile, enquiries, online listing |
| PG Manager team | Overview, businesses, business page, checks queue and review, plans, payments, support, SMS gateways, platform team, settings |
| Tenant app | Home, rent, pay by UPI, bill, complaints, new complaint, notices, food menu, profile, give notice, settings |

## How it is built
React 19 + TypeScript + Vite + Tailwind 4 and the same `ui-kit` components as `frontend/`, so
approved screens move into the real app with little change. Sample data: `src/data/seed.ts`.
Rules for adding screens: `CONVENTIONS.md`.

```
npm run dev        # live preview on :5180
npm run build      # check types and build
node scripts-single.mjs dist PG-Manager-prototype.html   # remake the one-file version
```
