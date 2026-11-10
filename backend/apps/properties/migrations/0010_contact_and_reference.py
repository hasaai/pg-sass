"""Every property gets a short reference ("PG-7K3M9Q") and an optional contact number.
Existing properties get a reference here; nothing else about them changes."""

import secrets

from django.db import migrations, models

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def fill_references(apps, schema_editor):  # type: ignore[no-untyped-def]
    Property = apps.get_model("properties", "Property")
    used = set(Property.objects.exclude(reference=None).values_list("reference", flat=True))
    for prop in Property.objects.filter(reference=None):
        code = ""
        while not code or code in used:
            code = "PG-" + "".join(secrets.choice(ALPHABET) for _ in range(6))
        used.add(code)
        Property.objects.filter(pk=prop.pk).update(reference=code)


class Migration(migrations.Migration):
    dependencies = [("properties", "0009_room_feature")]

    operations = [
        migrations.AddField(
            model_name="property",
            name="contact_phone",
            field=models.CharField(blank=True, max_length=15),
        ),
        migrations.AddField(
            model_name="property",
            name="reference",
            field=models.CharField(editable=False, max_length=12, null=True),
        ),
        migrations.RunPython(fill_references, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="property",
            name="reference",
            field=models.CharField(editable=False, max_length=12, unique=True),
        ),
    ]
