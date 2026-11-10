import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("tenants", "0004_fill_stay_property")]

    operations = [
        migrations.AlterField(
            model_name="stay",
            name="property",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="stays",
                to="properties.property",
            ),
        ),
    ]
