from django.contrib import admin

from apps.finance.models import Employee, Expense


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ["full_name", "role_title", "organization", "monthly_salary", "is_active"]
    raw_id_fields = ["organization", "property", "created_by"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["paid_on", "category", "vendor", "amount", "organization"]
    list_filter = ["category"]
    raw_id_fields = ["organization", "property", "employee", "created_by"]
