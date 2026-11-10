from django.contrib import admin
from django.utils import timezone

from apps.listings.models import Enquiry, Listing, ListingPhoto, ListingReport, PgRequest


class PhotoInline(admin.TabularInline):
    model = ListingPhoto
    extra = 0
    fields = ("image", "caption", "position")


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    """Platform team: verify listings here before they appear on the marketplace."""

    list_display = ["headline", "property", "organization", "is_published", "is_verified"]
    list_filter = ["is_verified", "is_published"]
    search_fields = ["headline", "slug", "organization__name"]
    raw_id_fields = ["property", "organization", "created_by"]
    inlines = [PhotoInline]
    actions = ["mark_verified", "mark_unverified"]

    @admin.action(description="Mark selected listings as verified")
    def mark_verified(self, request, queryset):
        queryset.update(is_verified=True, verified_at=timezone.now())

    @admin.action(description="Remove verification (hides them from the marketplace)")
    def mark_unverified(self, request, queryset):
        queryset.update(is_verified=False, verified_at=None)


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "listing", "status", "created_at"]
    list_filter = ["status"]
    raw_id_fields = ["listing", "organization", "created_by"]


@admin.register(ListingReport)
class ListingReportAdmin(admin.ModelAdmin):
    list_display = ["listing", "reason", "status", "created_at"]
    list_filter = ["status", "reason"]
    raw_id_fields = ["listing", "reporter"]


@admin.register(PgRequest)
class PgRequestAdmin(admin.ModelAdmin):
    list_display = ["pg_name", "locality", "contact_name", "contact_phone", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["pg_name", "locality", "contact_phone"]
