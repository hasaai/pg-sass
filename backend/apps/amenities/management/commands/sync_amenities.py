from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from apps.amenities import catalog
from apps.amenities.models import Amenity, AmenityCategory


class Command(BaseCommand):
    help = "Add amenities from apps/amenities/catalog.py that are missing from the database."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Also reset existing entries to catalog.py (undoes edits made in admin).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        created, updated = catalog.sync(AmenityCategory, Amenity, overwrite=options["overwrite"])
        self.stdout.write(self.style.SUCCESS(f"Amenities: {created} added, {updated} updated."))
