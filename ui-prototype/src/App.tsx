/** All routes. Hash URLs (#/app/…) so the prototype works from any folder or link. */
import {
  Link,
  Outlet,
  RouterProvider,
  createHashRouter,
  createMemoryRouter,
  useLocation,
} from 'react-router'
import { useEffect } from 'react'

import { DemoSwitcher } from './demo/DemoSwitcher'
import { SessionProvider, useSession } from './demo/session'
import * as core from './features/core/routes'
import * as operations from './features/operations/routes'
import * as people from './features/people/routes'
import * as platform from './features/platform/routes'
import * as properties from './features/properties/routes'
import * as publicPages from './features/public/routes'
import * as tenantApp from './features/tenant-app/routes'
import { AppShell } from './shell/AppShell'
import { PlatformShell } from './shell/PlatformShell'
import { PublicLayout } from './shell/PublicLayout'
import { TenantShell } from './shell/TenantShell'

const ALL_SCREENS = [
  ...publicPages.screens,
  ...core.screens,
  ...properties.screens,
  ...people.screens,
  ...operations.screens,
  ...platform.screens,
  ...tenantApp.screens,
]

function ScrollToTop() {
  const { pathname } = useLocation()
  const { role, setRole } = useSession()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  // A link straight to /platform or /tenant shows that person, so shared links look right.
  useEffect(() => {
    if (pathname.startsWith('/platform') && role !== 'platform') setRole('platform')
    else if (pathname.startsWith('/tenant') && role !== 'tenant') setRole('tenant')
    else if (pathname.startsWith('/app') && (role === 'platform' || role === 'tenant'))
      setRole('owner')
  }, [pathname, role, setRole])
  return null
}

function Root() {
  return (
    <>
      <ScrollToTop />
      <Outlet />
      <DemoSwitcher />
    </>
  )
}

function ScreensIndex() {
  const groups = [...new Set(ALL_SCREENS.map((s) => s.group))]
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">All screens</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every screen in the prototype. Use “Viewing as” (bottom right) to see the app as each
        person.
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g} className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">{g}</h2>
            <ul className="grid gap-1 text-[13px]">
              {ALL_SCREENS.filter((s) => s.group === g).map((s) => (
                <li key={s.path}>
                  <Link to={s.path} className="text-primary hover:underline">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl font-bold text-muted-foreground">404</p>
      <h1 className="mt-3 text-lg font-semibold">This page doesn’t exist</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        Go to the home page
      </Link>
    </div>
  )
}

const routeTree = [
  {
    element: <Root />,
    children: [
      { element: <PublicLayout />, children: publicPages.routes },
      {
        path: '/app',
        element: <AppShell />,
        children: [...core.routes, ...properties.routes, ...people.routes, ...operations.routes],
      },
      { path: '/platform', element: <PlatformShell />, children: platform.routes },
      { path: '/tenant', element: <TenantShell />, children: tenantApp.routes },
      { path: '/screens', element: <ScreensIndex /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

// The shareable single-page build (VITE_ROUTER=memory) keeps the address bar untouched.
const router =
  import.meta.env.VITE_ROUTER === 'memory'
    ? createMemoryRouter(routeTree, { initialEntries: ['/'] })
    : createHashRouter(routeTree)

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
