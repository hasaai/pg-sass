from rest_framework.routers import SimpleRouter

from apps.operations.views import ComplaintViewSet, NoticeViewSet

router = SimpleRouter()
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("notices", NoticeViewSet, basename="notice")

urlpatterns = router.urls
