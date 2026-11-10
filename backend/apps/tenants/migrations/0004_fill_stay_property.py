from django.db import migrations


def fill_property(apps, schema_editor):
    Stay = apps.get_model("tenants", "Stay")
    for stay in Stay.objects.select_related("bed__room").iterator():
        stay.property_id = stay.bed.room.property_id
        stay.save(update_fields=["property"])


class Migration(migrations.Migration):
    dependencies = [("tenants", "0003_stay_room_unit_property")]

    operations = [migrations.RunPython(fill_property, migrations.RunPython.noop)]
