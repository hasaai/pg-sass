from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.finance.views import (
    EmployeeViewSet,
    ExpenseViewSet,
    FinanceSummaryView,
    MonthlyReportCsvView,
)

router = SimpleRouter()
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("employees", EmployeeViewSet, basename="employee")

urlpatterns = [
    path("reports/finance", FinanceSummaryView.as_view(), name="report-finance"),
    path("reports/monthly.csv", MonthlyReportCsvView.as_view(), name="report-monthly"),
    *router.urls,
]
