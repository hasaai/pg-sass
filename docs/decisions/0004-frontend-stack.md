# 0004: Frontend stack and how it talks to the API

Date: 2026-10-18 · Status: accepted

## Decision
- **React 19 + TypeScript + Vite 7**: fast dev server and build, standard tooling.
- **React Router 7**: nested layouts (public, auth, operator app) and route guards.
- **TanStack Query 5**: caching and refetching of server data; mutations invalidate by API path.
- **openapi-typescript**: TypeScript types generated from the Django OpenAPI schema, so the
  frontend cannot silently drift from the API. Generated file is committed; CI checks it.
- **No UI or form libraries yet**: a small set of components in `src/components/ui.tsx` and a
  tiny `useForm` hook; validation messages come from the server. Plain CSS, mobile-first.
- **Dev proxy**: Vite forwards `/api` to Django, so the app and API share an origin and the
  httpOnly `SameSite=Strict` refresh cookie works without CORS. Production must keep the
  same-origin setup (reverse proxy).
- **Tests**: Vitest + Testing Library for units; Playwright for the end-to-end journey against
  the real API on desktop and phone viewports.

## Deferred
- Installable PWA offline cache (a web manifest is included; no service worker yet).
- Form library (React Hook Form + Zod) if forms grow more complex.
- Tenant self-service portal (needs phone OTP login, which needs an SMS provider).
