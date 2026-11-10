from django.contrib import admin

from apps.applications.models import Application, WishlistItem


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ["full_name", "listing", "status", "move_in_date", "created_at"]
    list_filter = ["status"]
    raw_id_fields = ["listing", "applicant", "organization", "created_by", "decided_by", "stay"]


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ["user", "listing", "created_at"]
    raw_id_fields = ["user", "listing"]
