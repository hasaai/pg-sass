from unittest import mock

from django.apps import apps
from django.db import DatabaseError
from django.urls import reverse
from rest_framework.test import APIClient

from apps.organizations.models import Organization, Role
from core.models import OrgScopedModel
from core.tests.support import Actor, authed_client, make_actor, make_membership

# Models that are deliberately not owned by one organization.
GLOBAL_MODELS = {
    "accounts.User",
    "organizations.Organization",
    # Platform-level records reviewed by the PG Manager team, not by one operator:
    "listings.ListingReport",
    "listings.PgRequest",
    # Belongs to a seeker (any user), never shown to operators:
    "applications.WishlistItem",
    # The amenity catalog is shared by every organization (assignments are org-scoped):
    "amenities.AmenityCategory",
    "amenities.Amenity",
    # Membership plans and the payment gateways on offer are set by the platform team:
    "subscriptions.Plan",
    "subscriptions.PaymentGateway",
    # Mobile codes belong to a user (before any business); SMS gateways and their log are
    # run by the platform team:
    "verification.PhoneCode",
    "verification.SmsGateway",
    "verification.SmsLog",
    # The PG Manager team and changes to it:
    "platform.PlatformStaff",
    "platform.PlatformEvent",
    # What a person agreed to when signing up (belongs to the person, not one business):
    "onboarding.ConsentRecord",
}

MEMBERS_URL = reverse("v1:member-list")


class TestHealth:
    def test_ok(self, anon: APIClient) -> None:
        response = anon.get(reverse("v1:health"))
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "ok"}

    def test_reports_database_outage(self, anon: APIClient) -> None:
        with mock.patch("core.views.connection") as fake_connection:
            fake_connection.cursor.side_effect = DatabaseError
            response = anon.get(reverse("v1:health"))
        assert response.status_code == 503
        assert response.json()["database"] == "unavailable"


class TestModelRules:
    def test_every_business_model_is_org_scoped(self) -> None:
        offenders = [
            model._meta.label
            for model in apps.get_models()
            if model.__module__.startswith("apps.")
            and model._meta.label not in GLOBAL_MODELS
            and not issubclass(model, OrgScopedModel)
        ]
        assert offenders == [], f"Models must inherit OrgScopedModel: {offenders}"


class TestErrorFormat:
    def test_not_authenticated(self, anon: APIClient) -> None:
        response = anon.get(MEMBERS_URL)
        assert response.status_code == 401
        assert response.json() == {
            "error": {
                "code": "not_authenticated",
                "message": "Authentication credentials were not provided.",
                "fields": {},
            }
        }

    def test_validation_error(self, anon: APIClient) -> None:
        response = anon.post(reverse("v1:auth-login"), {"email": "not-an-email"})
        body = response.json()["error"]
        assert response.status_code == 400
        assert body["code"] == "validation_error"
        assert set(body["fields"]) == {"email", "password"}


class TestOrganizationResolution:
    def test_single_membership_needs_no_header(self, owner: Actor) -> None:
        assert owner.client.get(MEMBERS_URL).status_code == 200

    def test_several_memberships_need_header(self, owner: Actor) -> None:
        make_membership(user=owner.user, role=Role.OWNER)
        response = owner.client.get(MEMBERS_URL)
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "organization_required"

    def test_header_selects_organization(self, owner: Actor) -> None:
        second = make_membership(user=owner.user, role=Role.OWNER)
        client = authed_client(owner.user, second.organization)
        response = client.get(reverse("v1:organization-current"))
        assert response.status_code == 200
        assert response.json()["id"] == str(second.organization.id)

    def test_header_for_foreign_organization_is_refused(
        self, owner: Actor, outsider: Actor
    ) -> None:
        client = authed_client(owner.user, outsider.organization)
        response = client.get(MEMBERS_URL)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "organization_not_accessible"

    def test_malformed_header_is_refused(self, owner: Actor) -> None:
        response = owner.client.get(MEMBERS_URL, HTTP_X_ORGANIZATION="not-a-uuid")
        assert response.status_code == 403

    def test_user_without_membership_is_refused(self) -> None:
        actor = make_actor(Role.OWNER)
        actor.membership.delete()
        response = actor.client.get(MEMBERS_URL)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "organization_not_accessible"

    def test_inactive_membership_is_refused(self, owner: Actor) -> None:
        owner.membership.is_active = False
        owner.membership.save()
        assert owner.client.get(MEMBERS_URL).status_code == 403

    def test_suspended_organization_is_refused(self, owner: Actor) -> None:
        Organization.objects.filter(pk=owner.organization.pk).update(
            status=Organization.Status.SUSPENDED
        )
        assert owner.client.get(MEMBERS_URL).status_code == 403
