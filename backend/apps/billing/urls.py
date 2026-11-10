from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.billing.reminder_views import DueRemindersView, EmailRemindersView, LogReminderView
from apps.billing.views import InvoiceViewSet, PaymentViewSet

router = SimpleRouter()
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("payments", PaymentViewSet, basename="payment")

urlpatterns = [
    path("reminders/due", DueRemindersView.as_view(), name="reminders-due"),
    path("reminders/log", LogReminderView.as_view(), name="reminders-log"),
    path("reminders/email", EmailRemindersView.as_view(), name="reminders-email"),
    *router.urls,
]
