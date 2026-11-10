from django.urls import reverse

from apps.operations.models import Complaint, Notice
from core.tests.support import Actor, assert_isolated, make_property, make_tenant

COMPLAINTS = reverse("v1:complaint-list")
NOTICES = reverse("v1:notice-list")


class TestComplaints:
    def test_staff_logs_and_resolves(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        tenant = make_tenant(owner.organization)
        created = staff.client.post(
            COMPLAINTS,
            {
                "property": str(prop.pk),
                "tenant": str(tenant.pk),
                "category": "wifi",
                "title": "No internet on 2nd floor",
                "priority": "high",
            },
        )
        assert created.status_code == 201, created.json()
        url = reverse("v1:complaint-detail", args=[created.json()["id"]])
        assigned = staff.client.patch(
            url, {"assignee": str(staff.user.pk), "status": "in_progress"}
        )
        assert assigned.json()["assignee_name"] == staff.user.full_name
        resolved = staff.client.patch(url, {"status": "resolved"})
        assert resolved.json()["resolved_at"]
        reopened = staff.client.patch(url, {"status": "open"})
        assert reopened.json()["resolved_at"] is None

    def test_assignee_must_be_team_member(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(owner.organization)
        response = owner.client.post(
            COMPLAINTS,
            {
                "property": str(prop.pk),
                "category": "other",
                "title": "x",
                "assignee": str(outsider.user.pk),
            },
        )
        assert "assignee" in response.json()["error"]["fields"]

    def test_bad_category_and_foreign_property(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(outsider.organization)
        response = owner.client.post(
            COMPLAINTS, {"property": str(prop.pk), "category": "x", "title": "t"}
        )
        assert {"property", "category"} <= set(response.json()["error"]["fields"])

    def test_staff_cannot_delete(self, owner: Actor, staff: Actor) -> None:
        c = Complaint.objects.create(
            organization=owner.organization,
            title="t",
            category="other",
            property=make_property(owner.organization),
        )
        url = reverse("v1:complaint-detail", args=[c.pk])
        assert staff.client.delete(url).status_code == 403
        assert owner.client.delete(url).status_code == 204

    def test_open_filter(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        for status in ("open", "in_progress", "resolved"):
            Complaint.objects.create(
                organization=owner.organization,
                title=status,
                category="other",
                property=prop,
                status=status,
            )
        rows = owner.client.get(COMPLAINTS, {"open": "true"}).json()["results"]
        assert {r["title"] for r in rows} == {"open", "in_progress"}

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        c = Complaint.objects.create(
            organization=owner.organization,
            title="t",
            category="other",
            property=make_property(owner.organization),
        )
        assert_isolated(
            outsider.client,
            reverse("v1:complaint-detail", args=[c.pk]),
            payload={"status": "closed"},
        )


class TestNotices:
    def test_manager_posts_staff_reads(self, owner: Actor, manager: Actor, staff: Actor) -> None:
        response = manager.client.post(NOTICES, {"title": "Water off Sunday", "body": "9am-12pm"})
        assert response.status_code == 201
        assert len(staff.client.get(NOTICES).json()["results"]) == 1
        assert staff.client.post(NOTICES, {"title": "x", "body": "y"}).status_code == 403

    def test_property_filter_includes_global(self, owner: Actor) -> None:
        a = make_property(owner.organization)
        b = make_property(owner.organization, name="B")
        Notice.objects.create(organization=owner.organization, title="all", body=".")
        Notice.objects.create(organization=owner.organization, title="a", body=".", property=a)
        Notice.objects.create(organization=owner.organization, title="b", body=".", property=b)
        rows = owner.client.get(NOTICES, {"property": str(a.pk)}).json()["results"]
        assert {r["title"] for r in rows} == {"all", "a"}

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        n = Notice.objects.create(organization=owner.organization, title="t", body=".")
        assert_isolated(
            outsider.client, reverse("v1:notice-detail", args=[n.pk]), payload={"title": "x"}
        )


def test_resolution_note(owner: Actor) -> None:
    c = Complaint.objects.create(
        organization=owner.organization,
        title="t",
        category="other",
        property=make_property(owner.organization),
    )
    body = owner.client.patch(
        reverse("v1:complaint-detail", args=[c.pk]),
        {"status": "resolved", "resolution_note": "Replaced the router."},
    ).json()
    assert body["resolution_note"] == "Replaced the router."
    assert body["resolved_at"]
