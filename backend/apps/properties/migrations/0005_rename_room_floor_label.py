from django.db import migrations


class Migration(migrations.Migration):
    """The free-text floor makes way for real Floor records (next migrations)."""

    dependencies = [("properties", "0004_property_property_type")]

    operations = [
        migrations.RenameField(model_name="room", old_name="floor", new_name="floor_label"),
    ]
