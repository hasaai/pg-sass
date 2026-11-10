"""Load the amenity catalog and convert the old free-text amenities.

Before the catalog, Property.amenities was a list of words such as "wifi" or
"hot water". Each known word becomes a PropertyAmenity marked available (with no extra
details, which owners can add later). Words the catalog doesn't know are kept in
Property.amenities so nothing is lost; they disappear the next time the owner saves
the property's amenities.
"""

from typing import Any

from django.db import migrations


def forwards(apps: Any, schema_editor: Any) -> None:
    from apps.amenities import catalog

    AmenityCategory = apps.get_model("amenities", "AmenityCategory")
    Amenity = apps.get_model("amenities", "Amenity")
    PropertyAmenity = apps.get_model("amenities", "PropertyAmenity")
    Property = apps.get_model("properties", "Property")

    catalog.sync(AmenityCategory, Amenity)
    by_key = {a.key: a for a in Amenity.objects.all()}
    legacy = catalog.legacy_map()
    for prop in Property.objects.all():
        words = prop.amenities if isinstance(prop.amenities, list) else []
        keys: set[str] = set()
        unknown: set[str] = set()
        for word in words:
            text = str(word).strip().lower()
            key = legacy.get(text) or (text if text in by_key else None)
            amenity = by_key.get(key) if key else None
            types = amenity.property_types if amenity else []
            if amenity is None or (types and prop.property_type not in types):
                if text:
                    unknown.add(text)
                continue
            if key not in keys:
                PropertyAmenity.objects.get_or_create(
                    property=prop,
                    amenity=amenity,
                    defaults={"organization_id": prop.organization_id, "status": "available"},
                )
                keys.add(key)
        prop.amenities = sorted(keys | unknown)
        prop.save(update_fields=["amenities"])


def backwards(apps: Any, schema_editor: Any) -> None:
    # Property.amenities still lists the keys, so dropping the rows loses nothing essential.
    apps.get_model("amenities", "PropertyAmenity").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("amenities", "0001_initial"),
        ("properties", "0004_property_property_type"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
