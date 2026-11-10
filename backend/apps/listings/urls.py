from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.listings.public import (
    PublicEnquiryView,
    PublicListingDetailView,
    PublicListingListView,
    PublicLocalitiesView,
    PublicPgRequestView,
    PublicReportView,
)
from apps.listings.views import EnquiryViewSet, ListingPhotoViewSet, ListingViewSet

router = SimpleRouter()
router.register("listings", ListingViewSet, basename="listing")
router.register("listing-photos", ListingPhotoViewSet, basename="listing-photo")
router.register("enquiries", EnquiryViewSet, basename="enquiry")

urlpatterns = [
    path("public/listings/", PublicListingListView.as_view(), name="public-listing-list"),
    path("public/listings/<slug:slug>/", PublicListingDetailView.as_view(), name="public-listing"),
    path(
        "public/listings/<slug:slug>/enquiries/",
        PublicEnquiryView.as_view(),
        name="public-enquiry",
    ),
    path("public/listings/<slug:slug>/report/", PublicReportView.as_view(), name="public-report"),
    path("public/pg-requests/", PublicPgRequestView.as_view(), name="public-pg-request"),
    path("public/localities/", PublicLocalitiesView.as_view(), name="public-localities"),
    *router.urls,
]
