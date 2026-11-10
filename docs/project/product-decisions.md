# Product decisions (FirstStartup / PG SaaS)

## 2026-10-18 — Priority: SaaS operations first, marketplace later (San)
- Build the SaaS platform first so operators can run all daily operations: properties (floors, flats/portions, rooms, beds), tenants, rent and invoices, expenses, staff, reminders, reports.
- The marketplace apps (public search, listings, booking, SEO, seeker features) come later as a separate stage. Until then, existing marketplace code is only kept working (no regressions, API stays backward compatible) and is not extended.
- When choosing between work items, operator-side features win.

## 2026-10-18 — Plain-language naming (San)
- Every on-screen word must be understandable by ordinary PG owners and staff. Technical names (RentalUnit, Stay, publication_status) stay in code/API only.
- UI wording lives in one labels file; the API sends a readable label with every status code; tests fail if a raw code shows on screen. Glossary is in the architecture doc.

## 2026-10-18 — Properties Management Portal architecture approved (San)
- Doc: https://claude.ai/code/artifact/7636ace6-3811-4145-9d06-609cd5d2c695 (local copy: docs/architecture/properties-portal-architecture.md).
- Hierarchy: Property → optional Floor → optional Flat/Portion → optional Room → optional Bed.
- Decisions (all as recommended): 1 UI stack Tailwind/shadcn/RHF/Zod/Recharts, on the new property screens only · 2 rooms may sit directly under a property · 3 tenants rent a bed, a room or a whole flat/portion · 4 platform admins are Django staff · 5 admin tables use numbered pages.
- Scope now: property management only, phase by phase; phase 1 (backend foundations) done in commit 90e20c1.
