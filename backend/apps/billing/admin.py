from django.contrib import admin

from apps.billing.models import Invoice, InvoiceLine, Payment


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    fields = ("kind", "description", "amount")
    readonly_fields = fields


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ["number", "period", "status", "total", "paid", "organization"]
    list_filter = ["status", "period"]
    search_fields = ["number"]
    raw_id_fields = ["stay", "organization", "created_by"]
    inlines = [InvoiceLineInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["receipt_number", "invoice", "amount", "mode", "received_on"]
    list_filter = ["mode"]
    raw_id_fields = ["invoice", "organization", "created_by"]
