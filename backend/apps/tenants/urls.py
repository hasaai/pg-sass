from rest_framework.routers import SimpleRouter

from apps.tenants.views import StayViewSet, TenantViewSet

router = SimpleRouter()
router.register("tenants", TenantViewSet, basename="tenant")
router.register("stays", StayViewSet, basename="stay")

urlpatterns = router.urls
