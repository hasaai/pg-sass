from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.platform import views

router = SimpleRouter()
router.register(
    "platform/organizations", views.OrganizationViewSet, basename="platform-organization"
)
router.register("platform/properties", views.PropertyViewSet, basename="platform-property")
router.register("platform/users", views.UserViewSet, basename="platform-user")
router.register("platform/amenities", views.AmenityViewSet, basename="platform-amenity")
router.register("platform/staff", views.StaffViewSet, basename="platform-staff")

urlpatterns = [
    path("platform/overview", views.OverviewView.as_view(), name="platform-overview"),
    path("platform/activity", views.ActivityView.as_view(), name="platform-activity"),
    path(
        "platform/documents/<uuid:pk>/download",
        views.DocumentDownloadView.as_view(),
        name="platform-document-download",
    ),
    *router.urls,
]
