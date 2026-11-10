from django.contrib import admin

from apps.properties.models import Bed, Property, PropertyPhoto, Room


class PropertyPhotoInline(admin.TabularInline):
    model = PropertyPhoto
    fields = ["image", "caption", "position"]
    extra = 0


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ["name", "locality", "organization", "is_active"]
    list_filter = ["is_active", "gender"]
    search_fields = ["name", "locality"]
    inlines = [PropertyPhotoInline]


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ["number", "property", "sharing"]
    raw_id_fields = ["property", "organization", "created_by"]


@admin.register(Bed)
class BedAdmin(admin.ModelAdmin):
    list_display = ["label", "room", "status", "monthly_rent"]
    list_filter = ["status"]
    raw_id_fields = ["room", "organization", "created_by"]
