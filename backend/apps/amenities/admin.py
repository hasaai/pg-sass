from django.contrib import admin

from apps.amenities.models import Amenity, AmenityCategory, PropertyAmenity


@admin.register(AmenityCategory)
class AmenityCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "key", "position"]
    list_editable = ["position"]
    ordering = ["position"]


@admin.register(Amenity)
class AmenityAdmin(admin.ModelAdmin):
    list_display = ["name", "key", "category", "position", "is_filterable", "is_active"]
    list_filter = ["category", "is_active", "is_filterable"]
    list_editable = ["position", "is_filterable", "is_active"]
    search_fields = ["name", "key"]
    readonly_fields = ["key"]


@admin.register(PropertyAmenity)
class PropertyAmenityAdmin(admin.ModelAdmin):
    list_display = ["property", "amenity", "status", "sharing", "charge", "charge_amount"]
    list_filter = ["status", "amenity__category"]
    raw_id_fields = ["property", "organization", "created_by"]
    filter_horizontal = ["rooms"]
