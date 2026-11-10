"""The four starting plans and the payment gateways; every existing business moves to
Business (no end date) so nothing is blocked on day one (approved decision 2)."""

from django.db import migrations
from django.utils import timezone

from apps.subscriptions.defaults import ensure_defaults


def seed(apps, schema_editor):
    Subscription = apps.get_model("subscriptions", "Subscription")
    SubscriptionEvent = apps.get_model("subscriptions", "SubscriptionEvent")
    Organization = apps.get_model("organizations", "Organization")
    plans = ensure_defaults(
        apps.get_model("subscriptions", "Plan"), apps.get_model("subscriptions", "PaymentGateway")
    )
    today = timezone.localdate()
    for org in Organization.objects.all():
        if not Subscription.objects.filter(organization=org).exists():
            Subscription.objects.create(
                organization=org, plan=plans["business"], status="active", starts_on=today
            )
            SubscriptionEvent.objects.create(
                organization=org,
                kind="assigned",
                to_plan=plans["business"],
                note="Existing business moved to Business when plans started",
            )


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0001_plans"),
        ("organizations", "0002_organization_disabled_features_organization_logo_and_more"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
