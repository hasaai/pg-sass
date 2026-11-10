"""The amenity catalog: categories, amenities and the details each one can carry.

This file is the *seed* of the catalog. A data migration and the `sync_amenities`
command copy it into the database (AmenityCategory / Amenity); after that the database
is the source of truth and the platform team can rename, reorder or deactivate entries
in Django admin. Keys are permanent: properties reference amenities by key.

Every amenity appears once (no duplicates across categories). Where one thing has
several flavours, it is one canonical amenity with options instead, e.g.
  - "Kitchen" + sharing (shared / private) instead of "Shared kitchen" and "Private kitchen"
  - "Bathroom" + type (attached / common) instead of "Attached bathroom"
  - "Terrace" + sharing instead of "Private terrace"
  - "Washing machine" (the machine; shared or in-unit) vs "Laundry service" (staff wash clothes)

Flags say which generic details apply:
  sharing  -> shared / private
  charge   -> included in rent / additional charge (+ amount and period)
  quantity -> how many
  rooms    -> can be limited to some rooms (property-level otherwise)
`attrs` are amenity-specific details, validated by `apps.amenities.services`.
"""

from __future__ import annotations

from typing import Any

# ---- property types (also the choices of Property.property_type) ----
PG = "pg"
COLIVING = "coliving"
HOSTEL = "hostel"
APARTMENT = "apartment"
HOUSE = "house"
BUILDING = "building"

PROPERTY_TYPES = [
    (PG, "PG accommodation"),
    (COLIVING, "Co-living space"),
    (HOSTEL, "Hostel"),
    (APARTMENT, "Apartment"),
    (HOUSE, "Independent house"),
    (BUILDING, "Standalone rental building"),
]

SHARED_LIVING = [PG, COLIVING, HOSTEL]  # beds/rooms let to individuals, run by an operator
HOMES = [APARTMENT, HOUSE, BUILDING]  # whole units let to a family or group
WHOLE_PROPERTY = [HOUSE, BUILDING]

# ---- attribute helpers ----


def choice(key: str, label: str, *options: tuple[str, str]) -> dict[str, Any]:
    return {"key": key, "label": label, "type": "choice", "options": [list(o) for o in options]}


def multi(key: str, label: str, *options: tuple[str, str]) -> dict[str, Any]:
    return {"key": key, "label": label, "type": "multi", "options": [list(o) for o in options]}


def number(key: str, label: str, min_: int, max_: int, unit: str = "") -> dict[str, Any]:
    return {"key": key, "label": label, "type": "int", "min": min_, "max": max_, "unit": unit}


def yes_no(key: str, label: str) -> dict[str, Any]:
    return {"key": key, "label": label, "type": "bool"}


FREQUENCY = choice(
    "frequency",
    "How often",
    ("daily", "Daily"),
    ("alternate", "Alternate days"),
    ("twice_week", "Twice a week"),
    ("weekly", "Weekly"),
    ("on_request", "On request"),
)
HOURS = choice("hours", "Hours", ("24x7", "24/7"), ("fixed", "Fixed timings"))

CATEGORIES: list[tuple[str, str]] = [
    ("building", "Building & Common Facilities"),
    ("room", "Room & Furnishing"),
    ("bathroom", "Bathroom & Hygiene"),
    ("kitchen", "Kitchen & Dining"),
    ("laundry", "Laundry & Housekeeping"),
    ("internet", "Internet & Technology"),
    ("parking", "Parking & Transportation"),
    ("fitness", "Fitness & Recreation"),
    ("study", "Study & Work Facilities"),
    ("utilities", "Utilities & Infrastructure"),
    ("safety", "Safety & Accessibility"),
    ("outdoor", "Outdoor & Green Spaces"),
    ("services", "Property Services"),
    ("standalone", "Standalone Property Features"),
]


def a(
    key: str,
    name: str,
    category: str,
    *,
    types: list[str] | None = None,
    flags: tuple[str, ...] = (),
    attrs: list[dict[str, Any]] | None = None,
    aliases: tuple[str, ...] = (),
    filterable: bool = False,
    legacy: tuple[str, ...] = (),
) -> dict[str, Any]:
    return {
        "key": key,
        "name": name,
        "category": category,
        "property_types": types or [],  # empty = every type
        "supports_sharing": "sharing" in flags,
        "supports_charge": "charge" in flags,
        "supports_quantity": "quantity" in flags,
        "supports_rooms": "rooms" in flags,
        "attributes": attrs or [],
        "aliases": list(aliases),
        "is_filterable": filterable,
        "legacy": list(legacy),  # words used in Property.amenities before the catalog existed
    }


AMENITIES: list[dict[str, Any]] = [
    # 1. Building & Common Facilities
    a("lift", "Lift", "building", aliases=("elevator",), filterable=True),
    a(
        "common_lounge",
        "Common lounge / TV room",
        "building",
        types=[*SHARED_LIVING, BUILDING],
        aliases=("common area", "lobby"),
    ),
    a("reception", "Reception / front desk", "building", types=SHARED_LIVING),
    a("visitor_area", "Visitor waiting area", "building", types=SHARED_LIVING),
    a(
        "clubhouse",
        "Clubhouse",
        "building",
        types=[APARTMENT],
        flags=("charge",),
        aliases=("society club",),
    ),
    # 2. Room & Furnishing
    a(
        "bed",
        "Bed / cot",
        "room",
        flags=("rooms",),
        attrs=[
            choice("size", "Bed size", ("single", "Single"), ("double", "Double"), ("bunk", "Bunk"))
        ],
        aliases=("cot",),
    ),
    a(
        "mattress",
        "Mattress",
        "room",
        flags=("rooms",),
        attrs=[number("thickness", "Thickness", 2, 12, "inches")],
    ),
    a(
        "pillow_linen",
        "Pillow & bed linen",
        "room",
        flags=("rooms",),
        aliases=("bedsheet", "blanket"),
    ),
    a("wardrobe", "Wardrobe / cupboard", "room", flags=("rooms",), aliases=("almirah", "cupboard")),
    a("study_table", "Study table & chair", "room", flags=("rooms",), aliases=("desk",)),
    a(
        "ac",
        "Air conditioning",
        "room",
        flags=("rooms", "charge", "quantity"),
        attrs=[
            choice(
                "ac_type", "Type", ("split", "Split"), ("window", "Window"), ("central", "Central")
            )
        ],
        aliases=("ac", "air conditioner", "aircon"),
        filterable=True,
        legacy=("ac",),
    ),
    a("fan", "Ceiling fan", "room", flags=("rooms",)),
    a(
        "television",
        "Television",
        "room",
        flags=("sharing", "rooms"),
        aliases=("tv",),
        legacy=("tv",),
    ),
    a("balcony", "Balcony", "room", flags=("sharing", "rooms")),
    a("shoe_rack", "Shoe rack", "room"),
    a(
        "furnishing",
        "Furnishing",
        "room",
        types=HOMES,
        attrs=[
            choice(
                "level",
                "Furnishing",
                ("fully", "Fully furnished"),
                ("semi", "Semi-furnished"),
                ("unfurnished", "Unfurnished"),
            )
        ],
        aliases=("furnished", "semi furnished"),
    ),
    # 3. Bathroom & Hygiene
    a(
        "bathroom",
        "Bathroom",
        "bathroom",
        flags=("rooms",),
        attrs=[choice("bathroom_type", "Bathroom", ("attached", "Attached"), ("common", "Common"))],
        aliases=("attached bathroom", "washroom", "toilet"),
        filterable=True,
    ),
    a(
        "geyser",
        "Hot water / geyser",
        "bathroom",
        flags=("rooms",),
        attrs=[HOURS],
        aliases=("hot water", "water heater"),
        filterable=True,
        legacy=("hot water",),
    ),
    a("western_toilet", "Western toilet", "bathroom", flags=("rooms",), aliases=("commode",)),
    a("sanitary_bins", "Sanitary bins", "bathroom", types=SHARED_LIVING),
    # 4. Kitchen & Dining
    a(
        "meals",
        "Meals",
        "kitchen",
        types=SHARED_LIVING,
        flags=("charge",),
        attrs=[
            multi(
                "meals",
                "Meals served",
                ("breakfast", "Breakfast"),
                ("lunch", "Lunch"),
                ("dinner", "Dinner"),
            ),
            choice("diet", "Food", ("veg", "Veg only"), ("non_veg", "Veg & non-veg")),
            choice(
                "plan",
                "Meal plan",
                ("monthly", "Monthly plan"),
                ("weekdays", "Weekdays only"),
                ("pay_per_meal", "Pay per meal"),
            ),
        ],
        aliases=("food", "mess", "tiffin"),
        filterable=True,
        legacy=("food",),
    ),
    a(
        "kitchen",
        "Kitchen",
        "kitchen",
        flags=("sharing",),
        attrs=[
            yes_no("self_cooking", "Residents may cook"),
            choice(
                "gas",
                "Cooking gas",
                ("piped", "Piped gas"),
                ("cylinder", "Cylinder"),
                ("induction", "Induction"),
            ),
        ],
        aliases=("shared kitchen", "private kitchen", "cooking"),
        filterable=True,
    ),
    a(
        "refrigerator",
        "Refrigerator",
        "kitchen",
        flags=("sharing", "rooms"),
        aliases=("fridge",),
        legacy=("fridge",),
    ),
    a("microwave", "Microwave", "kitchen", flags=("sharing",)),
    a("ro_water", "RO drinking water", "kitchen", aliases=("water purifier", "drinking water")),
    a("dining_area", "Dining area", "kitchen", types=[*SHARED_LIVING, *HOMES]),
    # 5. Laundry & Housekeeping
    a(
        "washing_machine",
        "Washing machine",
        "laundry",
        flags=("sharing", "charge"),
        attrs=[
            choice("machine", "Type", ("automatic", "Fully automatic"), ("semi", "Semi-automatic"))
        ],
        aliases=("in-unit laundry",),
        filterable=True,
    ),
    a(
        "laundry_service",
        "Laundry service",
        "laundry",
        types=[*SHARED_LIVING, BUILDING],
        flags=("charge",),
        attrs=[FREQUENCY, number("clothes_limit", "Clothes per wash", 1, 100, "pieces")],
        aliases=("laundry", "dhobi", "washing"),
        filterable=True,
        legacy=("laundry",),
    ),
    a("ironing", "Ironing", "laundry", types=[*SHARED_LIVING, BUILDING], flags=("charge",)),
    a(
        "housekeeping",
        "Room cleaning / housekeeping",
        "laundry",
        flags=("charge",),
        attrs=[FREQUENCY],
        aliases=("cleaning", "maid"),
        filterable=True,
        legacy=("housekeeping",),
    ),
    a(
        "linen_change",
        "Bed linen change",
        "laundry",
        types=SHARED_LIVING,
        attrs=[FREQUENCY],
    ),
    a("drying_area", "Clothes drying area", "laundry", flags=("sharing",)),
    # 6. Internet & Technology
    a(
        "wifi",
        "Wi-Fi",
        "internet",
        flags=("sharing", "charge"),
        attrs=[
            choice(
                "coverage",
                "Coverage",
                ("whole", "Whole property"),
                ("rooms", "In rooms"),
                ("common", "Common areas only"),
            ),
            number("speed_mbps", "Speed", 1, 10000, "Mbps"),
        ],
        aliases=("internet", "wifi", "broadband"),
        filterable=True,
        legacy=("wifi",),
    ),
    a("broadband_ready", "Broadband connection point", "internet", types=HOMES),
    a("dth", "DTH / cable TV", "internet", flags=("charge",), aliases=("cable", "set top box")),
    a("charging_points", "Charging points near beds", "internet", types=SHARED_LIVING),
    # 7. Parking & Transportation
    a(
        "parking",
        "Parking",
        "parking",
        flags=("charge",),
        attrs=[
            multi(
                "vehicles",
                "For",
                ("two_wheeler", "Two-wheeler"),
                ("four_wheeler", "Four-wheeler"),
                ("bicycle", "Bicycle"),
            ),
            choice("cover", "Covered or open", ("covered", "Covered"), ("open", "Open")),
            number("capacity", "Capacity", 1, 500, "vehicles"),
        ],
        aliases=("bike parking", "car parking"),
        filterable=True,
        legacy=("parking",),
    ),
    a("ev_charging", "EV charging", "parking", flags=("charge",), aliases=("electric vehicle",)),
    a(
        "shuttle",
        "Shuttle / pickup",
        "parking",
        types=[*SHARED_LIVING, BUILDING],
        flags=("charge",),
        aliases=("cab", "transport"),
    ),
    # 8. Fitness & Recreation
    a(
        "gym",
        "Gym",
        "fitness",
        flags=("sharing", "charge"),
        aliases=("fitness", "workout"),
        filterable=True,
        legacy=("gym",),
    ),
    a("swimming_pool", "Swimming pool", "fitness", flags=("sharing", "charge"), aliases=("pool",)),
    a(
        "indoor_games",
        "Indoor games",
        "fitness",
        types=[*SHARED_LIVING, APARTMENT, BUILDING],
        aliases=("table tennis", "carrom", "pool table"),
    ),
    a(
        "sports_court",
        "Sports court",
        "fitness",
        flags=("sharing",),
        aliases=("badminton", "basketball"),
    ),
    # 9. Study & Work Facilities
    a(
        "study_room",
        "Study room / library",
        "study",
        types=[*SHARED_LIVING, BUILDING],
        aliases=("library", "reading room"),
    ),
    a(
        "coworking",
        "Co-working space",
        "study",
        types=[*SHARED_LIVING, BUILDING],
        flags=("charge",),
        aliases=("work desk", "office space"),
    ),
    a(
        "printing",
        "Printing",
        "study",
        types=SHARED_LIVING,
        flags=("charge",),
        aliases=("printer",),
    ),
    # 10. Utilities & Infrastructure
    a(
        "power_backup",
        "Power backup",
        "utilities",
        attrs=[
            choice(
                "coverage",
                "Coverage",
                ("full", "Full backup"),
                ("partial", "Lights & fans only"),
                ("common", "Common areas only"),
            ),
            choice("source", "Source", ("generator", "Generator"), ("inverter", "Inverter")),
        ],
        aliases=("generator", "inverter", "dg"),
        filterable=True,
        legacy=("power backup",),
    ),
    a(
        "electricity",
        "Electricity",
        "utilities",
        flags=("charge",),
        attrs=[
            choice(
                "metering",
                "Billing",
                ("separate_meter", "Separate meter"),
                ("shared", "Shared / split"),
            )
        ],
        aliases=("power", "eb bill", "current bill"),
    ),
    a(
        "water_supply",
        "24/7 water supply",
        "utilities",
        attrs=[
            multi(
                "source",
                "Source",
                ("municipal", "Municipal (BWSSB)"),
                ("borewell", "Borewell"),
                ("tanker", "Tanker"),
            )
        ],
        aliases=("water",),
    ),
    a(
        "piped_gas",
        "Piped gas (PNG)",
        "utilities",
        types=HOMES,
        flags=("charge",),
        aliases=("png", "gas pipeline"),
    ),
    a("solar", "Solar power / water heater", "utilities", types=[*HOMES, PG, COLIVING]),
    # 11. Safety & Accessibility
    a(
        "cctv",
        "CCTV",
        "safety",
        aliases=("camera", "surveillance"),
        filterable=True,
        legacy=("cctv",),
    ),
    a(
        "security_guard",
        "Security guard",
        "safety",
        attrs=[HOURS],
        aliases=("watchman", "security"),
    ),
    a(
        "biometric_entry",
        "Biometric / card entry",
        "safety",
        aliases=("access control", "smart lock"),
    ),
    a("fire_safety", "Fire extinguisher & alarm", "safety", aliases=("fire",)),
    a("first_aid", "First-aid kit", "safety"),
    a("intercom", "Intercom", "safety"),
    a(
        "warden",
        "Resident warden",
        "safety",
        types=SHARED_LIVING,
        attrs=[HOURS],
        aliases=("caretaker",),
    ),
    a(
        "wheelchair_access",
        "Wheelchair accessible",
        "safety",
        aliases=("ramp", "accessible", "disabled"),
    ),
    # 12. Outdoor & Green Spaces
    a("garden", "Garden", "outdoor", flags=("sharing",), aliases=("lawn", "green")),
    a("terrace", "Terrace", "outdoor", flags=("sharing",), aliases=("rooftop", "private terrace")),
    a("play_area", "Children's play area", "outdoor", types=HOMES),
    a("sit_out", "Sit-out / seating area", "outdoor", flags=("sharing",), aliases=("porch",)),
    # 13. Property Services
    a(
        "maintenance",
        "Maintenance & repairs",
        "services",
        flags=("charge",),
        aliases=("plumber", "electrician"),
    ),
    a(
        "pest_control",
        "Pest control",
        "services",
        flags=("charge",),
        attrs=[
            choice(
                "frequency",
                "How often",
                ("monthly", "Monthly"),
                ("quarterly", "Quarterly"),
                ("on_request", "On request"),
            )
        ],
    ),
    a("waste_collection", "Waste collection", "services", aliases=("garbage",)),
    a("doctor_on_call", "Doctor on call", "services", types=SHARED_LIVING, flags=("charge",)),
    a(
        "grocery_store",
        "Grocery / convenience store",
        "services",
        types=[*SHARED_LIVING, APARTMENT, BUILDING],
        aliases=("shop",),
    ),
    # 14. Standalone Property Features
    a(
        "private_entrance",
        "Private entrance",
        "standalone",
        types=[*WHOLE_PROPERTY, APARTMENT],
        aliases=("separate entrance",),
    ),
    a(
        "independent_floor",
        "Independent floor",
        "standalone",
        types=WHOLE_PROPERTY,
        aliases=("entire floor",),
    ),
    a("store_room", "Store room", "standalone", types=HOMES),
    a(
        "servant_room",
        "Servant / utility room",
        "standalone",
        types=HOMES,
        aliases=("utility room",),
    ),
    a("pooja_room", "Pooja room", "standalone", types=HOMES, aliases=("prayer room",)),
    a("gated_community", "Gated community", "standalone", types=[APARTMENT, HOUSE]),
    a("rainwater_harvesting", "Rainwater harvesting", "standalone", types=WHOLE_PROPERTY),
    a("pets_allowed", "Pets allowed", "standalone", types=HOMES, aliases=("pet friendly",)),
]


def legacy_map() -> dict[str, str]:
    """Old free-text amenity word -> catalog key (used by the data migration)."""
    return {word: item["key"] for item in AMENITIES for word in item["legacy"]}


def sync(category_model: Any, amenity_model: Any, overwrite: bool = False) -> tuple[int, int]:
    """Add catalog entries that are missing from the database.

    With overwrite=True, existing entries are reset to this file (undoing admin edits).
    Never deletes: retire an amenity by unticking "active" in admin, so properties that
    use it keep their data. Takes the model classes so a data migration can pass its
    historical models. Returns (created, updated).
    """
    created = updated = 0
    cats: dict[str, Any] = {}
    for position, (key, name) in enumerate(CATEGORIES):
        defaults = {"name": name, "position": position}
        if overwrite:
            cat, _ = category_model.objects.update_or_create(key=key, defaults=defaults)
        else:
            cat, _ = category_model.objects.get_or_create(key=key, defaults=defaults)
        cats[key] = cat
    for position, item in enumerate(AMENITIES):
        values = {k: v for k, v in item.items() if k not in {"key", "category", "legacy"}}
        defaults = {**values, "category": cats[item["category"]], "position": position}
        if overwrite:
            _, was_created = amenity_model.objects.update_or_create(
                key=item["key"], defaults=defaults
            )
            updated += not was_created
        else:
            _, was_created = amenity_model.objects.get_or_create(key=item["key"], defaults=defaults)
        created += was_created
    return created, updated
