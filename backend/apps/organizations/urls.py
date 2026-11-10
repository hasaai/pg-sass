from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.organizations.views import (
    CurrentOrganizationView,
    MembershipViewSet,
    OrganizationLogoView,
)

router = SimpleRouter(trailing_slash=True)
router.register("members", MembershipViewSet, basename="member")

urlpatterns = [
    path("organizations/current", CurrentOrganizationView.as_view(), name="organization-current"),
    path(
        "organizations/current/logo",
        OrganizationLogoView.as_view(),
        name="organization-current-logo",
    ),
    *router.urls,
]
