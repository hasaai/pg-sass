from django.db import migrations

from apps.verification.defaults import ensure_gateways


def seed(apps, schema_editor):  # type: ignore[no-untyped-def]
    ensure_gateways(apps.get_model("verification", "SmsGateway"))


class Migration(migrations.Migration):
    dependencies = [("verification", "0001_gateways")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
