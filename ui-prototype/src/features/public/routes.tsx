/** Routes of this module. `screens` feeds the "All screens" index page. */
import type { RouteObject } from 'react-router'

import {
  ConfirmEmailPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  RegisterProfilePage,
} from './Auth'
import { LandingPage } from './Landing'
import { PrivacyPage, TermsPage } from './Legal'

export const routes: RouteObject[] = [
  { index: true, element: <LandingPage /> },
  { path: 'login', element: <LoginPage /> },
  { path: 'register', element: <RegisterPage /> },
  { path: 'register/profile', element: <RegisterProfilePage /> },
  { path: 'forgot-password', element: <ForgotPasswordPage /> },
  { path: 'confirm-email', element: <ConfirmEmailPage /> },
  { path: 'terms', element: <TermsPage /> },
  { path: 'privacy', element: <PrivacyPage /> },
]

const group = 'Website & sign-in'
export const screens: { path: string; label: string; group: string }[] = [
  { path: '/', label: 'Home page', group },
  { path: '/login', label: 'Sign in', group },
  { path: '/register', label: 'Register (mobile + code)', group },
  { path: '/register/profile', label: 'Register – about you', group },
  { path: '/forgot-password', label: 'Forgot password', group },
  { path: '/confirm-email', label: 'Email confirmed', group },
  { path: '/terms', label: 'Terms of use', group },
  { path: '/privacy', label: 'Privacy policy', group },
]
