from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.verification import views

router = SimpleRouter()
router.register("platform/sms-gateways", views.SmsGatewayViewSet, basename="platform-sms-gateway")
router.register("platform/sms-log", views.SmsLogViewSet, basename="platform-sms-log")

urlpatterns = [
    path("auth/mobile/", views.MobileStatusView.as_view(), name="mobile-status"),
    path("auth/mobile/send-code/", views.SendCodeView.as_view(), name="mobile-send-code"),
    path("auth/mobile/confirm/", views.ConfirmCodeView.as_view(), name="mobile-confirm"),
    *router.urls,
]
