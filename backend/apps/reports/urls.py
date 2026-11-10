from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.reports.views import AuditLogViewSet, CollectionsCsvView, DashboardView

router = SimpleRouter()
router.register("audit-log", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("reports/dashboard", DashboardView.as_view(), name="report-dashboard"),
    path("reports/collections.csv", CollectionsCsvView.as_view(), name="report-collections"),
    *router.urls,
]
