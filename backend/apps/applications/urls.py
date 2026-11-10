from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.applications.views import (
    ApplicationViewSet,
    MyApplicationViewSet,
    MyWishlistItemView,
    MyWishlistView,
)

router = SimpleRouter()
router.register("me/applications", MyApplicationViewSet, basename="my-application")
router.register("applications", ApplicationViewSet, basename="application")

urlpatterns = [
    path("me/wishlist/", MyWishlistView.as_view(), name="my-wishlist"),
    path("me/wishlist/<slug:slug>/", MyWishlistItemView.as_view(), name="my-wishlist-item"),
    *router.urls,
]
