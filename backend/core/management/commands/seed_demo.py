"""Fill a local database with a realistic demo PG business.

    python manage.py seed_demo            # add demo data (once)
    python manage.py seed_demo --fresh    # wipe the local database first, then add it

Sign in as demo@example.com / Demo-Pass-2026 (owner). Also: priya@example.com (manager),
raju@example.com and lakshmi@example.com (staff), seeker@example.com (someone looking
for a PG), same password.
Refuses to run unless DEBUG is on, so it can never touch production data.

All dates are relative to today, so the data always looks current: three months of rent
history with paid, part-paid and overdue invoices, past tenants with deposit refunds,
people on notice, complaints, notices, verified listings with photos and map pins,
marketplace leads, online applications, a wishlist, staff salaries and expenses.
"""

from __future__ import annotations

import datetime as dt
import io
import random
import shutil
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test.utils import override_settings
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.amenities import catalog as amenity_catalog
from apps.amenities import services as amenity_services
from apps.amenities.models import Amenity, AmenityCategory
from apps.applications import services as application_services
from apps.applications.models import Application, WishlistItem
from apps.billing import services as billing
from apps.billing.models import Invoice, RentReminder
from apps.finance import services as finance
from apps.finance.models import Employee, Expense
from apps.listings.models import Enquiry, Listing, ListingPhoto, PgRequest
from apps.operations.models import Complaint, Notice
from apps.organizations.models import Membership, Organization, Role
from apps.organizations.services import create_organization_with_owner
from apps.properties.models import (
    Bed,
    Floor,
    Letting,
    Property,
    PropertyDocument,
    PropertyPhoto,
    RentalUnit,
    Room,
    VerificationEvent,
)
from apps.tenants import services as stays
from apps.tenants.models import Stay, Tenant

EMAIL = "demo@example.com"
# Public demo login for local DEBUG databases only; the command refuses to run otherwise.
PASSWORD = "Demo-Pass-2026"  # noqa: S105

# (name, locality, landmark, gender, rent due day, rooms: (number, floor, sharing, rent ₹, AC))
PROPERTIES: list[tuple[str, str, str, str, int, list[tuple[str, str, int, int, bool]]]] = [
    (
        "Lotus Ladies PG",
        "HSR Layout",
        "Near BDA Complex",
        "women",
        5,
        [
            ("101", "1", 1, 14000, True),
            ("102", "1", 2, 9500, True),
            ("103", "1", 2, 8500, False),
            ("201", "2", 3, 7500, False),
            ("202", "2", 3, 7500, False),
            ("203", "2", 2, 9000, True),
        ],
    ),
    (
        "Green Nest Men's PG",
        "Koramangala",
        "Near Forum Mall",
        "men",
        5,
        [
            ("G1", "G", 2, 9000, False),
            ("G2", "G", 3, 7000, False),
            ("G3", "G", 3, 7000, False),
            ("101", "1", 2, 10500, True),
            ("102", "1", 1, 13000, True),
            ("103", "1", 4, 6000, False),
        ],
    ),
    (
        "Urban Nest Co-living",
        "Bellandur",
        "Opp. Ecospace Tech Park",
        "coed",
        1,
        [
            ("101", "1", 1, 15500, True),
            ("102", "1", 1, 15500, True),
            ("103", "1", 2, 11000, True),
            ("201", "2", 2, 11000, True),
            ("202", "2", 3, 8500, False),
        ],
    ),
    (
        "Sunrise Comforts",
        "BTM Layout",
        "Near Udupi Garden",
        "men",
        7,
        [
            ("1", "G", 3, 6500, False),
            ("2", "G", 3, 6500, False),
            ("3", "1", 4, 5500, False),
            ("4", "1", 2, 7500, False),
        ],
    ),
]

FIRST_F = [
    "Ananya",
    "Meera",
    "Divya",
    "Kavya",
    "Sneha",
    "Pooja",
    "Aishwarya",
    "Nikita",
    "Shruti",
    "Ritika",
    "Bhavana",
    "Swathi",
    "Neha",
    "Tanvi",
    "Lavanya",
    "Harini",
]
FIRST_M = [
    "Rahul",
    "Vikram",
    "Arjun",
    "Karthik",
    "Rohan",
    "Aditya",
    "Siddharth",
    "Nikhil",
    "Pranav",
    "Varun",
    "Manoj",
    "Harsha",
    "Akash",
    "Deepak",
    "Sameer",
    "Abhishek",
    "Kiran",
    "Tejas",
    "Gaurav",
    "Ravi",
]
SURNAMES = [
    "Iyer",
    "Nair",
    "Rao",
    "Reddy",
    "Kulkarni",
    "Sharma",
    "Menon",
    "Joshi",
    "Hegde",
    "Das",
    "Gowda",
    "Prasad",
    "Agarwal",
    "Shetty",
    "Patel",
    "Gupta",
    "Kumar",
    "Verma",
    "Bhat",
    "Yadav",
    "Singh",
    "Pillai",
    "Khan",
    "Jain",
    "Naik",
    "Desai",
    "Mishra",
]
# Approximate centre of each locality (lat, lng); each PG gets a small offset.
LOCATIONS = {
    "HSR Layout": (12.9116, 77.6474),
    "Koramangala": (12.9352, 77.6245),
    "Bellandur": (12.9304, 77.6784),
    "BTM Layout": (12.9166, 77.6101),
}
STAFF = [
    # (name, role, property index or None, salary ₹, pay day)
    ("Manjunath", "Cook", 0, 18000, 1),
    ("Shanthamma", "Housekeeping", 0, 12000, 1),
    ("Venkatesh", "Cook", 1, 18000, 1),
    ("Ramesh", "Security guard", 1, 14000, 5),
    ("Lalitha", "Housekeeping", 2, 12500, 1),
    ("Basavaraj", "Maintenance (all PGs)", None, 16000, 7),
]
CROSSES = ["5th", "8th", "14th", "22nd"]
RELATIONS = ["Father", "Mother", "Brother"]
OCCUPATIONS = [
    "Software engineer",
    "Student, Christ University",
    "Analyst",
    "Designer",
    "Student, PES University",
    "Sales executive",
    "Nurse",
    "Data scientist",
    "Customer support",
    "Chartered accountant (article)",
    "QA engineer",
]


def _room_picture(rng: random.Random, name: str, kind: int) -> ContentFile:
    """A simple illustrated room (no stock photos, no copyright) as a JPEG."""
    from PIL import Image, ImageDraw

    walls = [(232, 222, 205), (214, 228, 222), (226, 214, 228), (240, 232, 210)]
    accents = [(15, 118, 110), (180, 83, 9), (30, 64, 175), (157, 23, 77)]
    wall, accent = rng.choice(walls), rng.choice(accents)
    img = Image.new("RGB", (960, 600), wall)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 430, 960, 600], fill=(176, 141, 105))  # wooden floor
    for x in range(0, 960, 120):
        d.line([x, 430, x - 60, 600], fill=(160, 126, 92), width=3)
    d.rectangle([600, 90, 860, 300], fill=(186, 220, 240), outline=(255, 255, 255), width=10)
    d.line([730, 90, 730, 300], fill=(255, 255, 255), width=8)
    if kind == 0:  # bedroom: two beds and a wardrobe
        for x in (70, 330):
            d.rectangle([x, 330, x + 220, 470], fill=accent)
            d.rectangle([x, 300, x + 220, 345], fill=(250, 250, 250))
            d.rectangle([x + 10, 285, x + 80, 320], fill=(255, 255, 255))
        d.rectangle([880, 140, 950, 470], fill=(120, 90, 60))
    elif kind == 1:  # common area: sofa and TV
        d.rectangle([80, 330, 460, 450], fill=accent)
        d.rectangle([80, 290, 460, 340], fill=tuple(max(0, c - 30) for c in accent))
        d.rectangle([140, 140, 420, 280], fill=(30, 30, 30))
    else:  # dining: table and chairs
        d.rectangle([200, 330, 700, 360], fill=(120, 90, 60))
        for x in (230, 640):
            d.rectangle([x, 360, x + 20, 470], fill=(120, 90, 60))
        for x in (150, 330, 510, 720):
            d.rectangle([x, 300, x + 50, 420], fill=accent)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=82)
    return ContentFile(buffer.getvalue(), name=name)


def _months_back(first: dt.date, n: int) -> dt.date:
    d = first
    for _ in range(n):
        d = (d - dt.timedelta(days=1)).replace(day=1)
    return d


def _logo_png(text: str, colour: tuple[int, int, int]) -> ContentFile:
    """A plain square logo with initials (generated, so no copyright questions)."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (256, 256), colour)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([28, 28, 228, 228], radius=40, outline=(255, 255, 255), width=10)
    d.text((128, 128), text, fill=(255, 255, 255), anchor="mm", font_size=96)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return ContentFile(buffer.getvalue(), name="logo.png")


DEMO_PDF = b"%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n"


def _demo_branding_and_documents(org: Organization, owner: User, props: list[Property]) -> None:
    """Business and property logos, private documents and verification history."""
    org.logo = _logo_png("DS", (37, 82, 214))
    org.save(update_fields=["logo"])
    today = dt.date.today()
    K = PropertyDocument.Kind
    for i, p in enumerate(props):
        initials = "".join(w[0] for w in p.name.split()[:2]).upper()
        p.logo = _logo_png(
            initials, [(15, 118, 110), (157, 23, 77), (180, 83, 9), (30, 64, 175)][i % 4]
        )
        p.verification_status = Property.Verification.VERIFIED
        p.save(update_fields=["logo", "verification_status"])
        docs = [
            (
                K.RENTAL_AGREEMENT,
                "Lease with the building owner",
                today.replace(year=today.year - 1),
                today.replace(year=today.year + 2),
            ),
            (
                K.TRADE_LICENSE,
                "BBMP trade licence",
                today - dt.timedelta(days=345),
                today + dt.timedelta(days=20),
            ),
            (
                K.FIRE_NOC,
                "",
                today - dt.timedelta(days=800),
                today - dt.timedelta(days=5) if i == 0 else today + dt.timedelta(days=300),
            ),
            (K.ELECTRICITY_BILL, f"BESCOM bill {today:%b %Y}", today - dt.timedelta(days=10), None),
        ]
        for kind, title, issued, expires in docs:
            PropertyDocument.objects.create(
                organization=org,
                created_by=owner,
                property=p,
                kind=kind,
                title=title,
                file=ContentFile(DEMO_PDF, name="document.pdf"),
                file_name=f"{kind}.pdf",
                size_bytes=len(DEMO_PDF),
                content_type="application/pdf",
                issued_on=issued,
                expires_on=expires,
            )
        for status, note, by_platform in (
            (Property.Verification.SUBMITTED, "", False),
            (Property.Verification.VERIFIED, "Lease and trade licence checked.", True),
        ):
            VerificationEvent.objects.create(
                organization=org,
                created_by=owner,
                property=p,
                status=status,
                note=note,
                by_platform=by_platform,
            )
    maple = Property.objects.get(organization=org, name="Maple Residency")
    PropertyDocument.objects.create(
        organization=org,
        created_by=owner,
        property=maple,
        kind=K.OWNERSHIP_PROOF,
        title="Sale deed",
        file=ContentFile(DEMO_PDF, name="deed.pdf"),
        file_name="sale-deed.pdf",
        size_bytes=len(DEMO_PDF),
        content_type="application/pdf",
    )
    maple.verification_status = Property.Verification.SUBMITTED
    maple.save(update_fields=["verification_status"])
    VerificationEvent.objects.create(
        organization=org,
        created_by=owner,
        property=maple,
        status=Property.Verification.SUBMITTED,
        note="Please verify our new building.",
    )


def _demo_flats_and_house(org: Organization, owner: User) -> None:
    """A building of flats (family rentals) and an independent house: no beds at all."""
    building = Property.objects.create(
        organization=org,
        created_by=owner,
        name="Maple Residency",
        property_type="building",
        building_name="Maple Residency",
        address_line="18, 5th Main",
        locality="HSR Layout",
        pincode="560102",
        total_floors=2,
        year_built=2016,
        built_up_area_sqft=9200,
    )
    first, second = (
        Floor.objects.create(organization=org, created_by=owner, property=building, number=n)
        for n in (1, 2)
    )
    for code, floor, kind, rent in (
        ("Flat 101", first, RentalUnit.UnitType.BHK2, 28000),
        ("Flat 102", first, RentalUnit.UnitType.BHK1, 19000),
        ("Flat 201", second, RentalUnit.UnitType.BHK3, 36000),
    ):
        RentalUnit.objects.create(
            organization=org,
            created_by=owner,
            property=building,
            floor=floor,
            code=code,
            unit_type=kind,
            letting=Letting.WHOLE,
            monthly_rent=rent * 100,
            deposit=rent * 300,
            furnishing=RentalUnit.Furnishing.SEMI,
            bedrooms=int(kind[0]) if kind[0].isdigit() else 1,
            bathrooms=2,
        )
    shared = RentalUnit.objects.create(
        organization=org,
        created_by=owner,
        property=building,
        floor=second,
        code="Flat 202",
        unit_type=RentalUnit.UnitType.BHK3,
        letting=Letting.BY_PARTS,
        bedrooms=3,
        bathrooms=2,
        furnishing=RentalUnit.Furnishing.FULLY,
    )
    for number, rent in (("1", 12000), ("2", 11000), ("3", 11000)):
        Room.objects.create(
            organization=org,
            created_by=owner,
            property=building,
            unit=shared,
            floor=second,
            number=number,
            room_type=Room.RoomType.PRIVATE,
            letting=Letting.WHOLE,
            monthly_rent=rent * 100,
            sharing=1,
        )

    house = Property.objects.create(
        organization=org,
        created_by=owner,
        name="Banyan Villa",
        property_type="house",
        address_line="7, 2nd Cross",
        locality="Koramangala",
        pincode="560034",
        total_floors=2,
        year_built=2009,
        built_up_area_sqft=2400,
    )
    RentalUnit.objects.create(
        organization=org,
        created_by=owner,
        property=house,
        code="Whole house",
        unit_type=RentalUnit.UnitType.WHOLE_HOUSE,
        letting=Letting.WHOLE,
        monthly_rent=55000 * 100,
        deposit=55000 * 500,
        bedrooms=4,
        bathrooms=3,
        furnishing=RentalUnit.Furnishing.UNFURNISHED,
    )


def _demo_amenities(p: Property, rooms: list[Room], rng: random.Random, owner: User) -> None:
    """A realistic amenity setup: shared vs private, included vs extra, room-level."""
    # `--fresh` flushes the database, catalog included; put it back first.
    amenity_catalog.sync(AmenityCategory, Amenity)
    catalog = {a.key: a for a in Amenity.objects.all()}
    ac_rooms = [r for r in rooms if r.is_ac]
    attached = [r for r in rooms if r.has_attached_bath]
    coliving = p.property_type == "coliving"

    def item(key: str, **values: Any) -> dict[str, Any]:
        return {"amenity": catalog[key], **values}

    items = [
        item("bed", details={"size": "single"}),
        item("mattress", details={"thickness": 6}),
        item("wardrobe"),
        item("study_table"),
        item("pillow_linen"),
        item(
            "wifi",
            sharing="private" if coliving else "shared",
            charge="included",
            details={"coverage": "whole", "speed_mbps": rng.choice([50, 100, 150])},
        ),
        item(
            "meals",
            charge="included",
            details={
                "meals": ["breakfast", "dinner"] if coliving else ["breakfast", "lunch", "dinner"],
                "diet": rng.choice(["veg", "non_veg"]),
                "plan": "monthly",
            },
        ),
        item(
            "housekeeping",
            charge="included",
            details={"frequency": rng.choice(["daily", "alternate"])},
        ),
        item(
            "power_backup",
            details={"coverage": rng.choice(["full", "partial"]), "source": "generator"},
        ),
        item("geyser", details={"hours": "24x7"}),
        item("cctv"),
        item("ro_water"),
        item("security_guard", details={"hours": rng.choice(["24x7", "fixed"])}),
        item(
            "washing_machine", sharing="shared", charge="included", details={"machine": "automatic"}
        ),
        item("refrigerator", sharing="shared"),
        item(
            "kitchen",
            sharing="shared",
            details={"self_cooking": coliving, "gas": "piped" if coliving else "cylinder"},
        ),
        item("terrace", sharing="shared"),
        item(
            "parking",
            charge=rng.choice(["included", "extra"]),
            details={
                "vehicles": ["two_wheeler"],
                "cover": rng.choice(["covered", "open"]),
                "capacity": rng.randint(6, 20),
            },
        ),
        item(
            "laundry_service",
            charge="extra",
            charge_amount=50000,
            charge_period="month",
            details={"frequency": "weekly", "clothes_limit": 15},
        ),
        # An explicit "no": tenants see it is not there, rather than wondering.
        item("lift", status="available" if coliving else "unavailable"),
    ]
    for entry in items:
        if entry["amenity"].key == "parking" and entry["charge"] == "extra":
            entry.update(charge_amount=30000, charge_period="month")
    if ac_rooms:
        items.append(
            item(
                "ac", level="room", rooms=ac_rooms, charge="included", details={"ac_type": "split"}
            )
        )
    if attached:
        items.append(
            item("bathroom", level="room", rooms=attached, details={"bathroom_type": "attached"})
        )
    else:
        items.append(item("bathroom", details={"bathroom_type": "common"}))
    if coliving:
        items += [
            item(
                "gym", sharing="shared", charge="extra", charge_amount=80000, charge_period="month"
            ),
            item("coworking", charge="included"),
            item("common_lounge"),
        ]
    for entry in items:
        errors = amenity_services.validate_assignment(p, entry["amenity"], entry)
        if errors:  # the demo data must follow the same rules as owners do
            raise CommandError(f"Demo amenity {entry['amenity'].key}: {errors}")
    amenity_services.replace_assignments(prop=p, items=items, actor=owner)


class Command(BaseCommand):
    help = "Create a realistic demo PG business (DEBUG only)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--fresh",
            action="store_true",
            help="Delete ALL data in the local database first (DEBUG only).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG=true (never on production data).")
        if options["fresh"]:
            call_command("flush", interactive=False, verbosity=0)
            # Files belonged to the rows just deleted; remove them so they don't pile up.
            for folder in ("public/listings", "private/agreements"):
                shutil.rmtree(settings.MEDIA_ROOT / folder, ignore_errors=True)
            self.stdout.write("Local database emptied.")
        elif User.objects.filter(email=EMAIL).exists():
            self.stdout.write(
                f"Demo data already exists. Sign in as {EMAIL} / {PASSWORD}\n"
                "To rebuild it: python manage.py seed_demo --fresh"
            )
            return
        # Approving the demo application sends an email; keep the console quiet.
        dummy_mail = "django.core.mail.backends.dummy.EmailBackend"
        with override_settings(EMAIL_BACKEND=dummy_mail), transaction.atomic():
            summary = self._seed()
            from apps.verification.defaults import ensure_gateways
            from apps.verification.models import SmsGateway

            ensure_gateways(SmsGateway)  # `--fresh` flushed them too
            # Demo people never see the mobile code screen.
            User.objects.update(phone_verified_at=timezone.now())
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        for line in summary:
            self.stdout.write(f"  {line}")

    # ------------------------------------------------------------------
    def _seed(self) -> list[str]:
        rng = random.Random(2026)  # noqa: S311 - deterministic fake data, not security
        today = timezone.localdate()
        this_month = today.replace(day=1)
        months = [_months_back(this_month, 2), _months_back(this_month, 1), this_month]

        from apps.subscriptions.defaults import ensure_defaults
        from apps.subscriptions.models import PaymentGateway, Plan, Subscription

        plans = ensure_defaults(Plan, PaymentGateway)  # `--fresh` flushed them too
        owner = User.objects.create_user(
            email=EMAIL, password=PASSWORD, full_name="Sankeerth (Owner)"
        )
        org = create_organization_with_owner(
            owner=owner, name="Demo Stays Pvt Ltd", contact_phone="9845000000"
        ).organization
        # The demo business has everything (4 PGs + a building + a house is past Pro's limits).
        Subscription.objects.filter(organization=org).update(
            plan=plans["business"], status="active", ends_on=None
        )
        team = [
            ("priya@example.com", "Priya Manager", Role.MANAGER),
            ("raju@example.com", "Raju (warden, Koramangala)", Role.STAFF),
            ("lakshmi@example.com", "Lakshmi (warden, HSR)", Role.STAFF),
            ("anil@example.com", "Anil Accountant", Role.ACCOUNTANT),
        ]
        from apps.platform.models import PlatformStaff

        for email, name, platform_role in (
            ("admin@example.com", "PG Manager platform team", "platform_owner"),
            ("finance@example.com", "Farah (finance)", "finance_admin"),
            ("support@example.com", "Suresh (support)", "support_agent"),
            ("checker@example.com", "Kavya (checking)", "verification_reviewer"),
        ):
            platform_user = User.objects.create_user(
                email=email, password=PASSWORD, full_name=name, is_staff=True
            )
            PlatformStaff.objects.create(user=platform_user, role=platform_role)
        members = {}
        for email, name, role in team:
            user = User.objects.create_user(email=email, password=PASSWORD, full_name=name)
            Membership.objects.create(organization=org, user=user, role=role, created_by=owner)
            members[email] = user

        # ---------- properties, rooms, beds ----------
        props: list[Property] = []
        beds_by_prop: dict[str, list[Bed]] = {}
        for name, locality, landmark, gender, due_day, layout in PROPERTIES:
            p = Property.objects.create(
                organization=org,
                created_by=owner,
                name=name,
                address_line=f"{rng.randint(10, 480)}, {rng.choice(CROSSES)} Cross",
                locality=locality,
                landmark=landmark,
                gender=gender,
                pincode="5600" + str(rng.randint(10, 99)),
                rent_due_day=due_day,
                latitude=Decimal(
                    str(round(LOCATIONS[locality][0] + rng.uniform(-0.004, 0.004), 6))
                ),
                longitude=Decimal(
                    str(round(LOCATIONS[locality][1] + rng.uniform(-0.004, 0.004), 6))
                ),
                property_type="coliving" if gender == "coed" else "pg",
            )
            props.append(p)
            beds_by_prop[p.name] = []
            floors: dict[str, Floor] = {}
            for number, floor, sharing, rent, ac in layout:
                if floor not in floors:
                    floors[floor] = Floor.objects.create(
                        organization=org,
                        created_by=owner,
                        property=p,
                        number=0 if floor == "G" else int(floor),
                    )
                room = Room.objects.create(
                    organization=org,
                    created_by=owner,
                    property=p,
                    number=number,
                    floor=floors[floor],
                    room_type=Room.RoomType.PRIVATE if sharing == 1 else Room.RoomType.SHARED,
                    sharing=sharing,
                    is_ac=ac,
                    has_attached_bath=ac or sharing == 1,
                )
                for i in range(sharing):
                    beds_by_prop[p.name].append(
                        Bed.objects.create(
                            organization=org,
                            created_by=owner,
                            room=room,
                            label="ABCDEF"[i],
                            monthly_rent=rent * 100,
                        )
                    )

        for p in props:
            _demo_amenities(p, list(p.rooms.all()), rng, owner)
        _demo_flats_and_house(org, owner)
        # two rooms have a balcony (charged extra) and a geyser (included in rent)
        from apps.properties.services import FeatureChoice, set_room_features

        for room in props[0].rooms.order_by("-number")[:2]:
            set_room_features(
                room,
                [
                    FeatureChoice("balcony", "extra", 50000),
                    FeatureChoice("geyser", "included", None),
                ],
                owner,
            )
        _demo_branding_and_documents(org, owner, props)

        used_names: set[str] = set()
        phone_seq = iter(range(9000010001, 9000019999))

        def unique_name(female: bool) -> str:
            while True:
                name = f"{rng.choice(FIRST_F if female else FIRST_M)} {rng.choice(SURNAMES)}"
                if name not in used_names:
                    used_names.add(name)
                    return name

        def new_tenant(p: Property) -> Tenant:
            female = p.gender == "women" or (p.gender == "coed" and rng.random() < 0.5)
            name = unique_name(female)
            return Tenant.objects.create(
                organization=org,
                created_by=owner,
                full_name=name,
                phone=str(next(phone_seq)),
                email=name.replace(" ", ".").lower() + "@mail.example",
                gender="female" if female else "male",
                occupation=rng.choice(OCCUPATIONS),
                id_type=rng.choice(["aadhaar", "aadhaar", "aadhaar", "pan", "passport"]),
                id_last4=str(rng.randint(1000, 9999)),
                emergency_contact_name=f"{rng.choice(RELATIONS)} of {name.split()[0]}",
                emergency_contact_phone=str(next(phone_seq)),
                consent_given_at=timezone.now(),
            )

        def check_in(tenant: Tenant, bed: Bed, on: dt.date) -> Stay:
            return stays.check_in(
                actor=owner,
                tenant=tenant,
                place=bed,
                check_in_date=on,
                deposit_amount=bed.monthly_rent * 2,
                deposit_collected=bed.monthly_rent * 2,
            )

        # Each warden works only in the PGs of their locality (property access).
        for email, locality in (
            ("raju@example.com", "Koramangala"),
            ("lakshmi@example.com", "HSR Layout"),
        ):
            Membership.objects.get(organization=org, user=members[email]).properties.set(
                [p for p in props if p.locality == locality]
            )

        # ---------- past tenants who already moved out (deposit refunded) ----------
        past = 0
        for p in props:
            bed = beds_by_prop[p.name][-1]
            stay = check_in(new_tenant(p), bed, _months_back(this_month, 6) + dt.timedelta(days=9))
            deductions = (
                [stays.Deduction("Cleaning and paint touch-up", 150000)] if past % 2 else []
            )
            stays.checkout(
                actor=owner,
                stay=stay,
                check_out_date=months[1] + dt.timedelta(days=rng.randint(8, 20)),
                deductions=deductions,
            )
            past += 1

        # ---------- current tenants (about 75% occupancy) ----------
        current: list[Stay] = []
        for p in props:
            free = list(Bed.objects.filter(room__property=p, status=Bed.Status.VACANT))
            rng.shuffle(free)
            take = round(len(free) * 0.75)
            for bed in free[:take]:
                r = rng.random()
                if r < 0.12:  # joined this month, so the first invoice is pro-rated
                    start = this_month + dt.timedelta(days=rng.randint(2, max(2, today.day - 1)))
                    start = min(start, today)
                elif r < 0.25:  # joined mid last month
                    start = months[1] + dt.timedelta(days=rng.randint(5, 20))
                else:
                    start = _months_back(this_month, rng.randint(3, 14)) + dt.timedelta(
                        days=rng.randint(0, 20)
                    )
                current.append(check_in(new_tenant(p), bed, start))

        # a family renting a whole flat and a professional renting a whole room in a shared flat
        maple = Property.objects.get(organization=org, name="Maple Residency")
        flat = RentalUnit.objects.get(property=maple, code="Flat 101")
        room = Room.objects.get(property=maple, unit__code="Flat 202", number="1")
        for place, on in ((flat, _months_back(this_month, 8)), (room, _months_back(this_month, 2))):
            rent = place.monthly_rent or 0
            stays.check_in(
                actor=owner,
                tenant=new_tenant(maple),
                place=place,
                check_in_date=on + dt.timedelta(days=4),
                deposit_amount=rent * 2,
                deposit_collected=rent * 2,
                lock_in_months=11 if place is flat else 0,
            )

        # a few people on notice, a blocked and a reserved bed
        for stay in rng.sample([s for s in current if s.check_in < months[1]], 3):
            stays.give_notice(
                actor=owner,
                stay=stay,
                notice_date=today - dt.timedelta(days=rng.randint(1, 10)),
                expected_checkout=today + dt.timedelta(days=rng.randint(7, 28)),
            )
        vacant = list(Bed.objects.for_org(org).filter(status=Bed.Status.VACANT))
        rng.shuffle(vacant)
        Bed.objects.filter(pk=vacant[0].pk).update(status=Bed.Status.BLOCKED)  # under repair
        Bed.objects.filter(pk=vacant[1].pk).update(status=Bed.Status.RESERVED)  # token paid

        # ---------- three months of rent ----------
        habits = {
            s.pk: rng.choices(["on_time", "late", "partial", "defaulter"], weights=[60, 20, 12, 8])[
                0
            ]
            for s in current
        }
        for period in months:
            for inv in billing.generate_invoices(organization=org, actor=owner, period=period):
                prop = inv.stay.property
                due = period.replace(day=prop.rent_due_day)
                Invoice.objects.filter(pk=inv.pk).update(issue_date=period, due_date=due)
                inv.refresh_from_db()
                if period == this_month and rng.random() < 0.3:
                    inv = billing.add_charge(
                        actor=owner,
                        invoice=inv,
                        kind="electricity",
                        description=f"Electricity {rng.randint(40, 140)} units",
                        amount=rng.randint(30, 120) * 1000,
                    )
                habit = habits.get(inv.stay_id, "on_time")  # past tenants paid on time
                is_current = period == this_month
                if is_current and due > today and habit != "on_time":
                    continue  # not due yet
                pay_day = min(
                    today,
                    due - dt.timedelta(days=rng.randint(0, 3))
                    if habit == "on_time"
                    else due + dt.timedelta(days=rng.randint(3, 12)),
                )
                pay_day = max(pay_day, inv.stay.check_in)
                if habit == "defaulter" and period != months[0]:
                    continue
                amount = inv.total
                if habit == "partial" and period != months[0]:
                    amount = inv.total // 2
                if pay_day > today or (
                    is_current and habit == "late" and due + dt.timedelta(days=3) > today
                ):
                    continue
                billing.record_payment(
                    actor=owner,
                    invoice=inv,
                    amount=amount,
                    mode=rng.choices(["upi", "upi", "upi", "cash", "bank_transfer"])[0],
                    received_on=pay_day,
                    reference=f"UTR{rng.randint(10**11, 10**12 - 1)}",
                )

        # ---------- operations ----------
        raju, lakshmi = members["raju@example.com"], members["lakshmi@example.com"]
        complaint_rows = [
            (
                "Green Nest Men's PG",
                "wifi",
                "Wi-Fi drops every evening on 1st floor",
                "high",
                "open",
                None,
            ),
            (
                "Green Nest Men's PG",
                "plumbing",
                "Geyser not working in G2",
                "high",
                "in_progress",
                raju,
            ),
            (
                "Lotus Ladies PG",
                "plumbing",
                "Tap leaking in room 201",
                "medium",
                "in_progress",
                lakshmi,
            ),
            ("Lotus Ladies PG", "food", "Dinner served late on weekdays", "low", "open", None),
            (
                "Urban Nest Co-living",
                "cleaning",
                "Common kitchen needs deep cleaning",
                "medium",
                "resolved",
                None,
            ),
            (
                "Sunrise Comforts",
                "electrical",
                "Fan regulator broken in room 3",
                "medium",
                "open",
                raju,
            ),
            ("Sunrise Comforts", "security", "Main gate lock is loose", "high", "resolved", raju),
            (
                "Urban Nest Co-living",
                "furniture",
                "Wardrobe hinge broken in 201",
                "low",
                "closed",
                None,
            ),
        ]
        by_name = {p.name: p for p in props}
        for prop_name, category, title, priority, status, assignee in complaint_rows:
            p = by_name[prop_name]
            tenant = Stay.objects.filter(property=p, status__in=["active", "notice"]).first()
            Complaint.objects.create(
                organization=org,
                created_by=owner,
                property=p,
                category=category,
                title=title,
                priority=priority,
                status=status,
                assignee=assignee,
                tenant=tenant.tenant if tenant else None,
                resolved_at=timezone.now() if status in ("resolved", "closed") else None,
            )
        Notice.objects.create(
            organization=org,
            created_by=owner,
            is_pinned=True,
            title="Rent due by the 5th",
            body="Please pay rent by UPI before the 5th to avoid a late fee.",
        )
        Notice.objects.create(
            organization=org,
            created_by=owner,
            property=by_name["Green Nest Men's PG"],
            title="Water supply off on Sunday 10am-1pm",
            body="Tank cleaning. Please store water on Saturday night.",
        )
        Notice.objects.create(
            organization=org,
            created_by=owner,
            property=by_name["Lotus Ladies PG"],
            title="Visitor timings",
            body="Visitors allowed in the lounge from 10am to 8pm.",
        )

        # ---------- marketplace ----------
        headlines = {
            "Lotus Ladies PG": "Safe AC rooms for women near HSR BDA Complex",
            "Green Nest Men's PG": "Budget PG for men near Forum Mall, Koramangala",
            "Urban Nest Co-living": "Private rooms for professionals next to Ecospace",
            "Sunrise Comforts": "Affordable sharing rooms in BTM 2nd Stage",
        }
        leads = [
            ("Sneha K", 2, "new", "Can I visit this weekend?"),
            ("Mohit A", 1, "new", "Is food included in the rent?"),
            ("Fathima S", 3, "contacted", "Need a bed from next month."),
            ("Ajay R", 2, "visit_scheduled", "Coming Saturday 11am."),
            ("Ishita P", 1, "converted", ""),
            ("Naveen T", 4, "lost", "Found something closer to office."),
        ]
        listings: list[Listing] = []
        for i, p in enumerate(props):
            listing = Listing.objects.create(
                organization=org,
                created_by=owner,
                property=p,
                slug=slugify(f"{p.name} {p.locality}"),
                headline=headlines[p.name],
                description="Fully furnished rooms with cot, mattress, wardrobe and study table. "
                "Three meals a day, weekly housekeeping and high-speed Wi-Fi.",
                contact_phone="9845000000",
                food_included=True,
                house_rules="No smoking or alcohol. Gate closes at 11pm.",
                is_published=True,
                published_at=timezone.now() - dt.timedelta(days=30 - i),
                is_verified=True,
                verified_at=timezone.now() - dt.timedelta(days=29 - i),
            )
            # Photos belong to the property (shown in the app and on the listing);
            # one extra photo is attached to the listing only.
            for n, caption in enumerate(["Room", "Common area", "Dining"]):
                PropertyPhoto.objects.create(
                    organization=org,
                    created_by=owner,
                    property=listing.property,
                    caption=caption,
                    position=n,
                    image=_room_picture(rng, f"{listing.slug}-{n}.jpg", n),
                )
            ListingPhoto.objects.create(
                organization=org,
                created_by=owner,
                listing=listing,
                caption="Room available now",
                position=0,
                image=_room_picture(rng, f"{listing.slug}-offer.jpg", 0),
            )
            listings.append(listing)
            for name, sharing, status, message in rng.sample(leads, 3):
                Enquiry.objects.create(
                    organization=org,
                    listing=listing,
                    name=name,
                    phone=str(next(phone_seq)),
                    preferred_sharing=sharing,
                    move_in_date=today + dt.timedelta(days=rng.randint(3, 30)),
                    message=message,
                    status=status,
                )

        # ---------- agreements ----------
        for stay in current:
            Stay.objects.filter(pk=stay.pk).update(
                notice_period_days=rng.choice([15, 30, 30, 30]),
                lock_in_months=rng.choice([0, 0, 3, 6]),
                agreement_end=stay.check_in + dt.timedelta(days=364),
            )

        # ---------- staff, salaries and expenses (3 months) ----------
        employees = [
            Employee.objects.create(
                organization=org,
                created_by=owner,
                full_name=name,
                role_title=role,
                property=props[idx] if idx is not None else None,
                monthly_salary=salary * 100,
                pay_day=pay_day,
                phone=str(next(phone_seq)),
                joined_on=months[0] - dt.timedelta(days=200),
            )
            for name, role, idx, salary, pay_day in STAFF
        ]
        for period in months:
            for emp in employees:
                pay_on = period.replace(day=emp.pay_day)
                if pay_on > today or (period == this_month and emp.full_name == "Basavaraj"):
                    continue  # this month's maintenance salary still due
                finance.pay_salary(
                    actor=owner,
                    employee=emp,
                    month=period,
                    amount=None,
                    paid_on=pay_on,
                    mode=rng.choice(["upi", "cash"]),
                )
            month_days = ((period + dt.timedelta(days=31)).replace(day=1) - period).days
            span = max(1, min(month_days, (today - period).days + 1))  # days paid so far
            # The current month is only part-way through: only part of its bills are in.
            share = span / month_days
            for p in props:
                beds_here = len(beds_by_prop[p.name])
                bills = [
                    ("electricity", "BESCOM", beds_here * rng.randint(700, 900)),
                    ("water", "Water tanker", beds_here * rng.randint(120, 200)),
                    (
                        "groceries",
                        rng.choice(["Reliance Fresh", "Nandini Dairy", "KR Market"]),
                        beds_here * rng.randint(1200, 1600),
                    ),
                    ("internet", "ACT Fibernet", 1500),
                ]
                if rng.random() < 0.6:
                    bills.append(
                        (
                            "maintenance",
                            rng.choice(["Plumber", "Electrician", "Carpenter"]),
                            rng.randint(800, 4500),
                        )
                    )
                for category, vendor, full in bills:
                    rupees = max(1, round(full * share)) if category != "internet" else full
                    day = min(rng.randint(1, 28), span)
                    Expense.objects.create(
                        organization=org,
                        created_by=owner,
                        property=p,
                        category=category,
                        vendor=vendor,
                        description=f"{vendor} - {period:%b %Y}",
                        amount=rupees * 100,
                        paid_on=period + dt.timedelta(days=day - 1),
                        mode=rng.choice(["upi", "upi", "bank_transfer", "cash"]),
                    )

        # ---------- rent reminders already sent ----------
        for inv in Invoice.objects.for_org(org).filter(status__in=["issued", "partially_paid"])[:5]:
            RentReminder.objects.create(
                organization=org, created_by=owner, invoice=inv, channel="whatsapp"
            )

        # ---------- seekers: applications and wishlists ----------
        seeker = User.objects.create_user(
            email="seeker@example.com",
            password=PASSWORD,
            full_name="Ishita Pai",
            phone="9811100001",
        )
        applicants = [seeker] + [
            User.objects.create_user(
                email=f"applicant{i}@example.com",
                password=PASSWORD,
                full_name=unique_name(i % 2 == 0),
                phone=f"98111000{10 + i}",
            )
            for i in range(5)
        ]
        plan = [(0, "pending"), (1, "pending"), (2, "pending"), (3, "declined"), (0, "approved")]
        for user, (listing_idx, outcome) in zip(applicants[1:], plan, strict=True):
            listing = listings[listing_idx]
            app = Application.objects.create(
                organization=org,
                listing=listing,
                applicant=user,
                full_name=user.full_name,
                phone=user.phone,
                email=user.email,
                occupation=rng.choice(OCCUPATIONS),
                id_type="aadhaar",
                id_last4=str(rng.randint(1000, 9999)),
                preferred_sharing=rng.choice([1, 2, 3]),
                move_in_date=today + dt.timedelta(days=rng.randint(5, 25)),
                message=rng.choice(["Can I move in early?", "Working nearby.", ""]),
                consent_given_at=timezone.now(),
            )
            if outcome == "declined":
                Application.objects.filter(pk=app.pk).update(
                    status="declined",
                    decline_reason="No vacancy for the requested sharing.",
                    decided_at=timezone.now(),
                    decided_by=owner,
                )
            elif outcome == "approved":
                free_bed = Bed.objects.filter(
                    room__property=listing.property, status=Bed.Status.VACANT
                ).first()
                if free_bed:
                    application_services.approve(
                        actor=owner,
                        application=app,
                        bed=free_bed,
                        check_in_date=today,
                        monthly_rent=None,
                        deposit_amount=free_bed.monthly_rent * 2,
                        deposit_collected=free_bed.monthly_rent,
                    )
        # the demo seeker: one pending application, two saved PGs
        Application.objects.create(
            organization=org,
            listing=listings[2],
            applicant=seeker,
            full_name=seeker.full_name,
            phone=seeker.phone,
            email=seeker.email,
            occupation="Product designer",
            id_type="passport",
            id_last4="4821",
            preferred_sharing=1,
            move_in_date=today + dt.timedelta(days=12),
            message="Looking for a single room.",
            consent_given_at=timezone.now(),
        )
        for listing in (listings[0], listings[2]):
            WishlistItem.objects.create(user=seeker, listing=listing)
        PgRequest.objects.create(
            pg_name="Sai Residency",
            locality="Marathahalli",
            contact_name="Ishita Pai",
            contact_phone=seeker.phone or "",
            requested_by=seeker,
            notes="Near Innovative Multiplex.",
        )

        # ---------- summary ----------
        beds = Bed.objects.for_org(org)
        invoices = Invoice.objects.for_org(org).exclude(status="void")
        overdue = [i for i in invoices if i.balance > 0 and i.due_date < today]
        return [
            f"Organization: {Organization.objects.get(pk=org.pk).name}",
            f"Logins (password {PASSWORD}): {EMAIL} owner · priya@example.com manager · "
            "raju@example.com (Koramangala), lakshmi@example.com (HSR) caretakers · "
            "anil@example.com accountant · seeker@example.com room seeker · "
            "admin@example.com platform owner · finance@, support@, checker@example.com "
            "platform team (/platform)",
            f"{len(props)} properties · {beds.count()} beds · "
            f"{beds.filter(status='occupied').count()} occupied",
            f"{len(current)} current tenants · {past} past tenants · 3 on notice",
            f"{invoices.count()} invoices over 3 months · {len(overdue)} overdue",
            f"{Complaint.objects.for_org(org).count()} complaints · "
            f"{Enquiry.objects.for_org(org).count()} marketplace leads · "
            f"{Application.objects.for_org(org).count()} applications",
            f"{len(employees)} staff · {Expense.objects.for_org(org).count()} expenses · "
            f"{PropertyPhoto.objects.for_org(org).count()} property photos",
        ]
