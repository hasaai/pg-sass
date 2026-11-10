# 0002: JWT access token in memory, refresh token in an httpOnly cookie

Date: 2026-10-17 · Status: accepted

## Decision
- Access token: 15 minutes, returned in the JSON body, kept in memory by the PWA,
  sent as `Authorization: Bearer`.
- Refresh token: 14 days, only ever set as an `httpOnly`, `Secure`,
  `SameSite=Strict` cookie with `Path=/api/v1/auth/`. Rotated on every refresh;
  the old one is blacklisted, so a stolen, already-used token is rejected.
- Logout blacklists the refresh token and clears the cookie.
- Login and register are rate limited (`THROTTLE_AUTH_RATE`, default 10/min per IP).
- Login gives the same error for an unknown email and a wrong password.

## Why
Page JavaScript cannot read the refresh token, which limits the damage of an
XSS bug to the 15-minute access token. `SameSite=Strict` plus the narrow path
blocks cross-site use of the cookie, and the refresh response body cannot be
read cross-origin.

## Open
- Phone OTP login for tenants waits for the SMS provider decision.
- Registration reveals whether an email is already taken (accepted for now;
  revisit with email verification).
- HSTS preload (`security.W021` silenced) is enabled once the production domain is final.
