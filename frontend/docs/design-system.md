# PG Manager design system (Nov 2026 redesign)

One calm, precise workspace for PG owners and their staff. Think Linear / Stripe / Ramp quality,
but for an Indian PG business: plain words, rupees, beds and rooms.

## Foundations (all in `src/index.css` `@theme`; use the Tailwind names)
- **Brand**: deep jade `primary` (hover `primary-hover`), soft tint `primary-soft`,
  `accent-foreground` for text on the tint. Use the brand for the main action, active nav and
  links only. Never as decoration.
- **Neutrals**: `background` (page), `card` (surfaces), `secondary`/`muted` (wells, table heads,
  chips), `border` (hairlines), `border-strong` (control borders on hover),
  `foreground`, `muted-foreground` (secondary text), `subtle-foreground` (placeholders, meta).
- **Status** (separate from brand): emerald = good/paid/vacant, amber = waiting/notice/reserved,
  red = overdue/urgent/errors, sky = info/in progress, slate = not available/closed. Use
  `Badge tone=…` and `Alert tone=…` instead of hand-made colours.
- **Type**: Geist (sans) and Geist Mono. Page title 26px semibold tracking -0.022em
  (`PageHeader`), section/card title 15px semibold, body 14px, meta 12–13px. Numbers always
  `tabular-nums`. Big KPI numbers 26–34px semibold tracking -0.025em.
- **Shape**: radius `md` for controls, `lg` for small panels, `xl` for cards, `2xl` for dialogs.
  Hairline borders + `shadow-xs` on cards; `shadow-lg` only for menus/popovers, `shadow-xl` for
  dialogs. No heavy shadows, no gradients except the tiny brand mark/avatars and progress bars.
- **Spacing**: page sections `gap-5`; card padding 20px (`px-5`); form grids `gap-4`.
- **Motion**: `animate-in` (fade + 3px rise), `animate-shimmer` skeletons, 150ms colour
  transitions, `active:translate-y-px` on buttons. Respect reduced motion (done globally).

## Components (use these; do not hand-roll)
`src/components/ui-kit`: Button (default/outline/secondary/ghost/destructive/link; sizes
sm/default/lg/icon/icon-sm; `busy`; `asChild` for links), Badge, Card + CardHeader + CardContent
+ CardFooter, Dialog (`variant="side"` for forms), ConfirmDialog, Field, Input, Textarea,
NativeSelect, Checkbox/CheckboxRow, ChoiceCards/Segmented, Menu*, Table/THead/TBody/TR/TH/TD,
Tabs*, Alert, ErrorAlert, EmptyState, PageHeader, StatCard, Meter, Skeleton, Tooltip, `toast`.
`src/components/ui.tsx` (older API, now drawn with the design system): Button, TextField,
SelectField, TextAreaField, Checkbox, ErrorBanner, Spinner (skeleton), Empty, Badge(value),
Card(title, actions), PageHeader(subtitle), Stat, Modal, Table(head), PeriodSwitcher.
Prefer ui-kit in new code; the older ones are fine where a screen already uses them.

## Patterns
- **Page**: `PageHeader` (title, one-line description, actions on the right) → optional KPI row
  (`StatCard`, 2 cols on phone, 4 on desktop) → filter bar → content cards.
- **Filter bar**: one row: search input with icon, segmented/chip filters, selects; wraps on phone.
- **Tables**: inside a `Card` with no inner padding; `Table` handles header and row hover;
  first column = the thing (name + small meta line), money right-aligned `tabular-nums`, status
  as `Badge` with `dot`, row actions in a `Menu` (MoreHorizontal ghost icon button). On phone,
  either keep the table scrolling in its own container or show a card list (`md:hidden`).
- **Forms**: `Field` + controls in a 1–2 column grid; dialogs for short forms, side dialogs for
  long forms; primary action bottom-right; errors under the field in plain words.
- **Empty states**: `EmptyState` with an icon, a clear title, one sentence of why, one action.
- **Loading**: `Skeleton` blocks shaped like the content (not spinners/text).
- Links: `text-primary font-medium no-underline hover:underline`.
- Never use the old CSS classes (`btn`, `card`, `toolbar`, `stats`, `grid-2`, `list`, `muted`,
  `badge`, `banner`, `filters`, `chips`, `row`, …) in screens you touch; replace them with
  Tailwind + components so the screen no longer needs the `legacy` wrapper.
