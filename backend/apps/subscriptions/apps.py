from django.apps import AppConfig


class SubscriptionsConfig(AppConfig):
    name = "apps.subscriptions"
    label = "subscriptions"
    verbose_name = "Membership plans and payments"

    def ready(self) -> None:
        from apps.subscriptions import signals  # noqa: F401
