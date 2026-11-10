from django.urls import path

from apps.amenities.views import AmenityCatalogView, PropertyAmenitiesView

urlpatterns = [
    path("amenities/", AmenityCatalogView.as_view(), name="amenity-catalog"),
    path(
        "properties/<uuid:pk>/amenities/",
        PropertyAmenitiesView.as_view(),
        name="property-amenities",
    ),
]
