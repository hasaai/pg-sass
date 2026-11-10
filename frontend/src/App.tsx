import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import { createQueryClient } from './api/queryClient'
import { AuthProvider } from './auth/AuthContext'
import {
  GuestOnly,
  RequireAuth,
  RequirePermission,
  RequirePlatformPermission,
  RequireSignedIn,
} from './auth/guards'
import { PublicLayout } from './components/PublicLayout'
import { LandingPage } from './features/landing/LandingPage'
import { BillingPage } from './pages/app/BillingPage'
import { ComplaintsPage } from './pages/app/ComplaintsPage'
import { DashboardPage } from './pages/app/DashboardPage'
import { EnquiriesPage } from './pages/app/EnquiriesPage'
import { InvoiceDetailPage } from './pages/app/InvoiceDetailPage'
import { ApplicationsPage } from './pages/app/ApplicationsPage'
import { FinancePage } from './pages/app/FinancePage'
import { ListingsPage } from './pages/app/ListingsPage'
import { NoticesPage } from './pages/app/NoticesPage'
import { ReceiptPage } from './pages/app/ReceiptPage'
import { RemindersPage } from './pages/app/RemindersPage'
import { StaffPage } from './pages/app/StaffPage'
import { TeamPage } from './features/team/TeamPage'
import { LoginPage } from './pages/auth/LoginPage'
import { ConfirmEmailPage } from './features/onboarding/ConfirmEmailPage'
import { LegalPage } from './features/onboarding/LegalPage'
import { ProfilePage } from './features/onboarding/ProfilePage'
import { RegisterPage } from './features/onboarding/RegisterPage'
import { VerifyMobilePage } from './pages/auth/VerifyMobilePage'
import { NotFoundPage } from './pages/NotFoundPage'

// The operator app (new design system) loads only after sign-in, so public visitors and
// room seekers do not download it.
const AppShell = lazy(() =>
  import('./components/shell/AppShell').then((m) => ({ default: m.AppShell })),
)
const PropertiesListPage = lazy(() =>
  import('./features/properties/PropertiesListPage').then((m) => ({
    default: m.PropertiesListPage,
  })),
)
const PropertyDetailPage = lazy(() =>
  import('./features/properties/detail/PropertyDetailPage').then((m) => ({
    default: m.PropertyDetailPage,
  })),
)
const PropertyWizardPage = lazy(() =>
  import('./features/properties/PropertyWizardPage').then((m) => ({
    default: m.PropertyWizardPage,
  })),
)

const TenantsListPage = lazy(() =>
  import('./features/tenants/TenantsListPage').then((m) => ({ default: m.TenantsListPage })),
)
const TenantDetailPage = lazy(() =>
  import('./features/tenants/TenantDetailPage').then((m) => ({ default: m.TenantDetailPage })),
)

const OwnerVerificationPage = lazy(() =>
  import('./features/onboarding/OwnerVerificationPage').then((m) => ({
    default: m.OwnerVerificationPage,
  })),
)
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const PlatformShell = lazy(() =>
  import('./features/platform/PlatformShell').then((m) => ({ default: m.PlatformShell })),
)
const PlatformStaffPage = lazy(() =>
  import('./features/platform/StaffPage').then((m) => ({ default: m.PlatformStaffPage })),
)
const PlatformOverviewPage = lazy(() =>
  import('./features/platform/OverviewPage').then((m) => ({ default: m.PlatformOverviewPage })),
)
const BusinessesPage = lazy(() =>
  import('./features/platform/BusinessesPage').then((m) => ({ default: m.BusinessesPage })),
)
const BusinessDetailPage = lazy(() =>
  import('./features/platform/BusinessDetailPage').then((m) => ({
    default: m.BusinessDetailPage,
  })),
)
const PlatformPropertiesPage = lazy(() =>
  import('./features/platform/PropertiesPage').then((m) => ({
    default: m.PlatformPropertiesPage,
  })),
)
const PropertyReviewPage = lazy(() =>
  import('./features/platform/PropertyReviewPage').then((m) => ({
    default: m.PropertyReviewPage,
  })),
)
const UsersPage = lazy(() =>
  import('./features/platform/UsersPage').then((m) => ({ default: m.UsersPage })),
)
const AmenitiesPage = lazy(() =>
  import('./features/platform/AmenitiesPage').then((m) => ({ default: m.AmenitiesPage })),
)
const ActivityPage = lazy(() =>
  import('./features/platform/ActivityPage').then((m) => ({ default: m.ActivityPage })),
)
const SmsGatewaysPage = lazy(() =>
  import('./features/platform/SmsGatewaysPage').then((m) => ({ default: m.SmsGatewaysPage })),
)
const PlansPage = lazy(() =>
  import('./features/platform/PlansPage').then((m) => ({ default: m.PlansPage })),
)
const PlanPaymentsPage = lazy(() =>
  import('./features/platform/PaymentsPage').then((m) => ({ default: m.PaymentsPage })),
)
const YourPlanPage = lazy(() =>
  import('./features/plans/YourPlanPage').then((m) => ({ default: m.YourPlanPage })),
)

function Loading({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p className="muted" style={{ padding: '2rem' }}>
          Loading…
        </p>
      }
    >
      {children}
    </Suspense>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route element={<PublicLayout />}>
        <Route element={<GuestOnly />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route path="verify-mobile" element={<RequireSignedIn />}>
          <Route index element={<VerifyMobilePage />} />
        </Route>
        <Route path="register/profile" element={<RequireSignedIn />}>
          <Route index element={<ProfilePage />} />
        </Route>
        <Route path="confirm-email" element={<ConfirmEmailPage />} />
        <Route path="terms" element={<LegalPage kind="terms" />} />
        <Route path="privacy" element={<LegalPage kind="privacy" />} />
      </Route>
      <Route path="app" element={<RequireAuth />}>
        <Route
          element={
            <Loading>
              <AppShell />
            </Loading>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="properties"
            element={
              <Loading>
                <PropertiesListPage />
              </Loading>
            }
          />
          <Route
            path="properties/:id"
            element={
              <Loading>
                <PropertyDetailPage />
              </Loading>
            }
          />
          <Route
            path="tenants"
            element={
              <Loading>
                <TenantsListPage />
              </Loading>
            }
          />
          <Route
            path="tenants/:id"
            element={
              <Loading>
                <TenantDetailPage />
              </Loading>
            }
          />
          <Route path="complaints" element={<ComplaintsPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route element={<RequirePermission perm="owner.verification" />}>
            <Route
              path="owner-verification"
              element={
                <Loading>
                  <OwnerVerificationPage />
                </Loading>
              }
            />
          </Route>
          <Route
            path="settings"
            element={
              <Loading>
                <SettingsPage />
              </Loading>
            }
          />
          <Route element={<RequirePermission perm="properties.manage" />}>
            <Route
              path="properties/new"
              element={
                <Loading>
                  <PropertyWizardPage />
                </Loading>
              }
            />
            <Route
              path="properties/:id/edit"
              element={
                <Loading>
                  <PropertyWizardPage />
                </Loading>
              }
            />
          </Route>
          <Route element={<RequirePermission perm="rent.view" />}>
            <Route path="billing" element={<BillingPage />} />
            <Route path="billing/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="billing/payments/:id/receipt" element={<ReceiptPage />} />
          </Route>
          <Route element={<RequirePermission perm="rent.collect" />}>
            <Route path="billing/reminders" element={<RemindersPage />} />
          </Route>
          <Route element={<RequirePermission perm="expenses.view" />}>
            <Route path="finance" element={<FinancePage />} />
          </Route>
          <Route element={<RequirePermission perm="salaries.manage" />}>
            <Route path="staff" element={<StaffPage />} />
          </Route>
          <Route element={<RequirePermission perm="listings.manage" />}>
            <Route path="listings" element={<ListingsPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="enquiries" element={<EnquiriesPage />} />
          </Route>
          <Route element={<RequirePermission perm="team.view" />}>
            <Route path="team" element={<TeamPage />} />
          </Route>
          <Route
            path="plan"
            element={
              <Loading>
                <YourPlanPage />
              </Loading>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route
        path="platform"
        element={
          <Loading>
            <PlatformShell />
          </Loading>
        }
      >
        <Route
          index
          element={
            <Loading>
              <PlatformOverviewPage />
            </Loading>
          }
        />
        <Route element={<RequirePlatformPermission perm={'p.businesses.view'} />}>
          <Route
            path="businesses"
            element={
              <Loading>
                <BusinessesPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.businesses.view'} />}>
          <Route
            path="businesses/:id"
            element={
              <Loading>
                <BusinessDetailPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.verification.review'} />}>
          <Route
            path="verification"
            element={
              <Loading>
                <PlatformPropertiesPage queue />
              </Loading>
            }
          />
        </Route>
        <Route
          element={
            <RequirePlatformPermission perm={['p.businesses.view', 'p.verification.review']} />
          }
        >
          <Route
            path="properties"
            element={
              <Loading>
                <PlatformPropertiesPage key="all" />
              </Loading>
            }
          />
        </Route>
        <Route
          element={
            <RequirePlatformPermission perm={['p.businesses.view', 'p.verification.review']} />
          }
        >
          <Route
            path="properties/:id"
            element={
              <Loading>
                <PropertyReviewPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.users.view'} />}>
          <Route
            path="users"
            element={
              <Loading>
                <UsersPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.catalog.manage'} />}>
          <Route
            path="amenities"
            element={
              <Loading>
                <AmenitiesPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.sms.manage'} />}>
          <Route
            path="sms"
            element={
              <Loading>
                <SmsGatewaysPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.plans.manage'} />}>
          <Route
            path="plans"
            element={
              <Loading>
                <PlansPage />
              </Loading>
            }
          />
        </Route>
        <Route
          element={<RequirePlatformPermission perm={['p.payments.view', 'p.gateways.manage']} />}
        >
          <Route
            path="payments"
            element={
              <Loading>
                <PlanPaymentsPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm={'p.activity.view'} />}>
          <Route
            path="activity"
            element={
              <Loading>
                <ActivityPage />
              </Loading>
            }
          />
        </Route>
        <Route element={<RequirePlatformPermission perm="p.staff.manage" />}>
          <Route
            path="staff"
            element={
              <Loading>
                <PlatformStaffPage />
              </Loading>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
