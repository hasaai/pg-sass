"""Copy existing data into the new structure. Nothing is removed.

- Property.is_active → status (active / inactive).
- A verified marketplace listing → the property's verification status.
- Room sharing 1 → private room.
- Free-text room floors that are a number or "G"/"Ground" → Floor records.
  Anything else stays in Room.floor_label for the owner to sort out.
"""

import re

from django.db import migrations

GROUND = {"g", "gf", "ground", "ground floor"}


def floor_number(text: str) -> int | None:
    value = text.strip().lower()
    if value in GROUND:
        return 0
    match = re.fullmatch(r"(-?\d{1,3})(st|nd|rd|th)?( floor)?", value)
    if match:
        number = int(match.group(1))
        if -5 <= number <= 200:
            return number
    return None


def forwards(apps, schema_editor):
    Property = apps.get_model("properties", "Property")
    Room = apps.get_model("properties", "Room")
    Floor = apps.get_model("properties", "Floor")
    Listing = apps.get_model("listings", "Listing")

    Property.objects.filter(is_active=True).update(status="active")
    Property.objects.filter(is_active=False).update(status="inactive")
    verified = Listing.objects.filter(is_verified=True).values_list("property_id", flat=True)
    Property.objects.filter(pk__in=list(verified)).update(verification_status="verified")
    Room.objects.filter(sharing=1).update(room_type="private")

    floors: dict[tuple, object] = {}
    for room in Room.objects.exclude(floor_label="").select_related("property"):
        number = floor_number(room.floor_label)
        if number is None:
            continue
        key = (room.property_id, number)
        if key not in floors:
            floors[key], _ = Floor.objects.get_or_create(
                property_id=room.property_id,
                number=number,
                defaults={
                    "organization_id": room.organization_id,
                    "created_by_id": room.created_by_id,
                },
            )
        room.floor = floors[key]
        room.save(update_fields=["floor"])


class Migration(migrations.Migration):
    dependencies = [
        ("properties", "0006_inventory_structure_and_statuses"),
        ("listings", "0002_listing_is_verified_listing_verified_at_listingphoto_and_more"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
