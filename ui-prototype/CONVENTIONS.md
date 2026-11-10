# PG Manager UI prototype – how to build screens

A clickable prototype of the whole PG Manager app with sample data and **no backend**.
It must look and feel like a finished product a Bengaluru PG owner would pay for.

## Stack (already set up – do not add packages)
React 19 + TypeScript + Vite, React Router 7 (hash URLs), Tailwind CSS 4, Radix via
`src/components/ui-kit`, Lucide icons, sonner toasts. No other libraries.

## Where things are
- `src/data/types.ts` – data shapes. `src/data/seed.ts` – sample data (TODAY = 2026-11-02,
  THIS_MONTH = '2026-11', AMENITY_CATALOG, ROOM_FEATURES, plans, PERMISSIONS, ROLE_PERMS).
- `src/data/store.ts` – `useDb(db => …)` to read, `updateDb(draft => { … })` to change,
  `newId('x')`, `logActivity(draft, {...})`. Changes show everywhere at once.
  `useDb` selectors must return values straight from the store or primitives – do the
  filtering/derivation in the component (`const rows = useDb(db => db.tenants)` then
  `useMemo`/plain code), never `useDb(db => db.tenants.filter(...))` (new array each render =
  infinite loop).
- `src/data/selectors.ts` – status maps with plain-word labels and tones (BED_STATUS,
  TENANT_STATUS, INVOICE_STATUS, COMPLAINT_STATUS, PRIORITY, PROPERTY_STATUS, VERIFICATION,
  OWNER_CHECK, PAY_MODE, …) and helpers (placeLabel, occupancy, balance, daysLate, floorName…).
- `src/components/ui-kit/*` – Button (variants default/outline/secondary/ghost/destructive/link,
  sizes sm/default/lg/icon/icon-sm, `busy`), Badge (tone neutral/info/good/warn/bad/outline,
  `dot`), Card/CardHeader/CardContent/CardFooter, Dialog (`variant="side"` for forms, `title`,
  `description`, `footer`), ConfirmDialog, Field (label/hint/error wrapper), Input, Textarea,
  NativeSelect, Checkbox/CheckboxRow, ChoiceCards/Segmented, Menu*, Table/THead/TBody/TR/TH/TD,
  Tabs*, Alert, EmptyState, PageHeader, StatCard, Meter, Skeleton, Tooltip, `toast` from
  `ui-kit/toast`. Read a component file before using it to see its props.
- `src/components/common` – Status, Avatar, Money, SearchBox, FilterChips, PropertyPicker,
  Toolbar, DetailList, PhotoTile, Bars (simple chart), Section, Switch, LineTabs, NoAccess.
- `src/lib/format.ts` – formatMoney(paise), formatDate('YYYY-MM-DD'), formatMonth, plural,
  relativeTime, rupeesToPaise. `src/lib/cn.ts` – class joiner.
- `src/demo/session.tsx` – `useSession()` → `{ role, person, can('rent.view') }`.
- `src/shell/crumbs.ts` – `useBreadcrumbs([{label:'Tenants', to:'/app/tenants'}, {label: name}])`
  on every page inside the business app / platform admin.

## Module rules
Each module lives in `src/features/<module>/` and exports from its `routes.tsx`:
`routes: RouteObject[]` (paths RELATIVE to the parent: `'tenants'`, `'tenants/:id'`,
`{ index: true, element }`) and `screens: {path, label, group}[]` (full hash path like
`/app/tenants`, used by the "All screens" page). Only edit files in your own module folder.
Do not change shared files (data, ui-kit, common, shell, App.tsx). If you need a helper, put it
in your module.

## Design rules
- Real product quality: clear hierarchy, generous spacing, consistent cards, aligned tables,
  realistic numbers from the store. No lorem ipsum, no "TODO", no dead buttons: every button
  either does something in the store (with a `toast.success('…')`) or opens a dialog/page.
- Plain words an ordinary PG owner understands ("Record payment", "Move to another bed",
  "Rent due", "Not finished") – never codes or tech words. Money in ₹ via formatMoney.
- Every list: search and/or filter chips, a property picker where it makes sense, counts,
  an EmptyState when nothing matches, and a row click that opens the detail.
- Forms: Dialog `variant="side"` (or a full page for long wizards), Field + labels, inline
  validation messages that say what to fix, sensible defaults.
- Phone first: everything must work at 390px wide (stack columns, tables scroll inside an
  `overflow-x-auto` wrapper or turn into cards, no page-wide sideways scroll).
- Respect permissions with `can(...)`: hide buttons a role can't use; caretakers never see money.
- Icons from lucide-react. Tailwind utility classes only; colours from the theme
  (primary, muted-foreground, border, …) plus emerald/amber/red/blue for status.

## Checks before you finish
From `ui-prototype/`: `npx tsc -b --noEmit 2>&1 | grep 'features/<module>'` must print nothing,
`npx eslint src/features/<module>` must show no errors, and
`npx prettier --write src/features/<module>`. Other builders work in parallel, so ignore errors
in other folders and do not run `vite build`.
