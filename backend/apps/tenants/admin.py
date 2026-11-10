from django.contrib import admin

from apps.tenants.models import DepositTransaction, Stay, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["full_name", "phone", "organization"]
    search_fields = ["full_name", "phone"]


@admin.register(Stay)
class StayAdmin(admin.ModelAdmin):
    list_display = ["tenant", "bed", "status", "check_in", "check_out"]
    list_filter = ["status"]
    raw_id_fields = ["tenant", "bed", "organization", "created_by"]


@admin.register(DepositTransaction)
class DepositTransactionAdmin(admin.ModelAdmin):
    list_display = ["stay", "kind", "amount", "date"]
    raw_id_fields = ["stay", "organization", "created_by"]
