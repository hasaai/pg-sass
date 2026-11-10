"""Add APITxT as an SMS gateway and make it the default: first in line and switched on.

It sends only once its auth key is set (Platform -> SMS gateways or APITXT_AUTH_KEY);
until then the next switched-on gateway sends the codes exactly as before.
"""

from django.db import migrations, models


def forwards(apps, schema_editor):  # type: ignore[no-untyped-def]
    SmsGateway = apps.get_model("verification", "SmsGateway")
    if SmsGateway.objects.filter(code="apitxt").exists():
        return
    SmsGateway.objects.update(position=models.F("position") + 1)
    SmsGateway.objects.create(code="apitxt", position=0, is_enabled=True)


def backwards(apps, schema_editor):  # type: ignore[no-untyped-def]
    SmsGateway = apps.get_model("verification", "SmsGateway")
    SmsGateway.objects.filter(code="apitxt").delete()


class Migration(migrations.Migration):
    dependencies = [("verification", "0003_gateway_credentials")]

    operations = [
        migrations.AlterField(
            model_name="smsgateway",
            name="code",
            field=models.CharField(
                choices=[
                    ("console", "Test (Terminal)"),
                    ("apitxt", "APITxT"),
                    ("twofactor", "2Factor"),
                    ("fast2sms", "Fast2SMS"),
                ],
                max_length=20,
                unique=True,
            ),
        ),
        migrations.AlterField(
            model_name="smslog",
            name="gateway",
            field=models.CharField(
                choices=[
                    ("console", "Test (Terminal)"),
                    ("apitxt", "APITxT"),
                    ("twofactor", "2Factor"),
                    ("fast2sms", "Fast2SMS"),
                ],
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
