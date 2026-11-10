# Project: PG Management SaaS

## Product goals
- Launch in one Bengaluru locality.
- Serve PG and co-living operators first.
- Build SaaS management first, with public property discovery.
- Support a web-first, mobile-friendly PWA.

## Technology
- Frontend: React + TypeScript
- Backend: Django REST Framework
- Database: PostgreSQL
- API: versioned REST API under /api/v1/
- Testing: pytest, Django API tests, Playwright

## Architecture rules
- Keep frontend and backend separately organized.
- Use Django apps organized by business domain.
- Enforce organization-level data isolation on the server.
- Use database migrations for schema changes.
- Never commit credentials or production data.
- Do not add dependencies without explaining why.
- Do not introduce microservices without an approved need.

## Development workflow
1. Read the relevant requirements and existing code.
2. Propose a small implementation plan.
3. Implement one feature at a time.
4. Add tests for success, failure and permission cases.
5. Run tests, linting and type checks.
6. Summarize changed files, test results and remaining risks.
7. Stop and report any failing checks; never claim unrun tests passed.
