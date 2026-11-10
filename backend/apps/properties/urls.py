from rest_framework.routers import SimpleRouter

from apps.properties.views import (
    BedViewSet,
    FloorViewSet,
    PropertyDocumentViewSet,
    PropertyPhotoViewSet,
    PropertyViewSet,
    RentalUnitViewSet,
    RoomViewSet,
)

router = SimpleRouter()
router.register("properties", PropertyViewSet, basename="property")
router.register("floors", FloorViewSet, basename="floor")
router.register("units", RentalUnitViewSet, basename="unit")
router.register("rooms", RoomViewSet, basename="room")
router.register("beds", BedViewSet, basename="bed")
router.register("property-photos", PropertyPhotoViewSet, basename="property-photo")
router.register("property-documents", PropertyDocumentViewSet, basename="property-document")

urlpatterns = router.urls
