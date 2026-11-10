"""Everyone already on the platform team (is_staff) keeps full access as Platform owner."""

from django.db import migrations


def forwards(apps, schema_editor):  # type: ignore[no-untyped-def]
    User = apps.get_model("accounts", "User")
    PlatformStaff = apps.get_model("platform", "PlatformStaff")
    for user in User.objects.filter(is_staff=True):
        PlatformStaff.objects.get_or_create(user=user, defaults={"role": "platform_owner"})


class Migration(migrations.Migration):
    dependencies = [("platform", "0001_platform_staff")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
