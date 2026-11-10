from django.db import migrations, models
from django.utils import timezone


def mark_existing_confirmed(apps, schema_editor):  # type: ignore[no-untyped-def]
    """People who signed up before mobile codes existed are not asked again."""
    apps.get_model("accounts", "User").objects.update(phone_verified_at=timezone.now())


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="phone_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(mark_existing_confirmed, migrations.RunPython.noop),
    ]
