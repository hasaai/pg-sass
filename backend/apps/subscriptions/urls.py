from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.subscriptions import views

router = SimpleRouter(trailing_slash=True)
router.register("platform/plans", views.PlatformPlanViewSet, basename="platform-plan")
router.register("platform/payments", views.PlatformPaymentViewSet, basename="platform-payment")
router.register("platform/gateways", views.PlatformGatewayViewSet, basename="platform-gateway")

urlpatterns = [
    path("plan/", views.MyPlanView.as_view(), name="my-plan"),
    path("plan/choices/", views.PlanChoicesView.as_view(), name="plan-choices"),
    path("plan/gateways/", views.CheckoutGatewaysView.as_view(), name="plan-gateways"),
    path("plan/checkout/", views.CheckoutView.as_view(), name="plan-checkout"),
    path("plan/confirm/", views.ConfirmView.as_view(), name="plan-confirm"),
    path("plan/payments/", views.MyPaymentsView.as_view(), name="plan-payments"),
    path("payments/webhooks/<str:code>/", views.WebhookView.as_view(), name="payment-webhook"),
    path("platform/plan-catalog/", views.PlanCatalogView.as_view(), name="platform-plan-catalog"),
    path(
        "platform/organizations/<uuid:pk>/subscription/",
        views.PlatformSubscriptionView.as_view(),
        name="platform-subscription",
    ),
    *router.urls,
]
