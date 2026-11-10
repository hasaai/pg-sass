from django.contrib import admin

from apps.operations.models import Complaint, Notice


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ["title", "property", "status", "priority", "created_at"]
    list_filter = ["status", "priority", "category"]
    raw_id_fields = ["property", "tenant", "assignee", "organization", "created_by"]


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ["title", "property", "is_pinned", "created_at"]
    raw_id_fields = ["property", "organization", "created_by"]
