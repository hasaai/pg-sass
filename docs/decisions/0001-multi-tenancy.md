# 0001: Shared-schema multi-tenancy with three isolation layers

Date: 2026-10-17 · Status: accepted

## Context
Many small operators (organizations) share one deployment. A leak of tenant
KYC or rent data between organizations would end the business.

## Decision
One PostgreSQL database and schema. Every business row has `organization_id`
(`core.models.OrgScopedModel`). Isolation is enforced three times:

1. **Queries**: `OrgScopedViewSet.get_queryset()` filters by the request's
   organization; `perform_create` sets it. Clients never send `organization`.
2. **Permissions**: `OrgRolePermission` resolves the organization from the
   user's active membership (`X-Organization` header when they have several)
   and checks `allowed_roles` per action. Missing rule = denied.
3. **Tests**: a model-rules test fails if a model in `apps.*` is not org-scoped;
   `assert_isolated` checks that another organization gets 404 on every method.

Objects in another organization return 404, not 403, so their existence is not revealed.

## Alternatives
- Schema-per-tenant (django-tenants): stronger isolation but slower migrations
  and harder cross-tenant marketplace queries. Rejected for the MVP.
- PostgreSQL row-level security: a good extra layer; deferred to hardening (Phase 6).
