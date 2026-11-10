"""Settings shared by every environment."""

from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from config.env import env_bool, env_int, env_list, env_str

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = env_str("DJANGO_SECRET_KEY")
DEBUG = env_bool("DJANGO_DEBUG", default=False)
# San added the tunnel hosts as defaults; DJANGO_ALLOWED_HOSTS in backend/.env overrides this.
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,trycloudflare.com,data-builder-readily-psychiatry.trycloudflare.com",
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    # Local
    "core",
    "apps.accounts",
    "apps.organizations",
    "apps.properties",
    "apps.tenants",
    "apps.billing",
    "apps.operations",
    "apps.listings",
    "apps.applications",
    "apps.finance",
    "apps.amenities",
    "apps.reports",
    "apps.platform",
    "apps.subscriptions",
    "apps.verification",
    "apps.onboarding",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DB_ENGINE = env_str("DB_ENGINE", "sqlite").strip().lower()
if DB_ENGINE not in {"sqlite", "postgres"}:
    raise ImproperlyConfigured("DB_ENGINE must be 'sqlite' or 'postgres'.")

DATABASES = {
    # SQLite by default so the project runs with nothing to install.
    # Set DB_ENGINE=postgres (plus the POSTGRES_* variables) to use PostgreSQL;
    # production must use PostgreSQL. CI runs the tests on both.
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / env_str("SQLITE_PATH", "db.sqlite3"),
        "ATOMIC_REQUESTS": True,
    }
    if DB_ENGINE == "sqlite"
    else {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env_str("POSTGRES_DB", "pgsaas"),
        "USER": env_str("POSTGRES_USER", "pgsaas"),
        "PASSWORD": env_str("POSTGRES_PASSWORD", ""),
        "HOST": env_str("POSTGRES_HOST", "localhost"),
        "PORT": env_int("POSTGRES_PORT", 5432),
        "CONN_MAX_AGE": 60,
        "ATOMIC_REQUESTS": True,
    }
}

AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded files. media/public/ (listing photos) may be served openly; media/private/
# (tenant agreements) is only ever streamed through an authenticated API endpoint.
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env_str("MEDIA_ROOT", str(BASE_DIR / "media")))
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES + 1024 * 1024

# Email (rent reminders, application updates). Console output unless configured.
EMAIL_BACKEND = env_str("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env_str("DEFAULT_FROM_EMAIL", "PG Manager <no-reply@localhost>")
EMAIL_HOST = env_str("EMAIL_HOST", "localhost")
EMAIL_PORT = env_int("EMAIL_PORT", 25)
EMAIL_HOST_USER = env_str("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env_str("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", default=False)

# Marketplace: listings appear publicly only after the platform team verifies them
# (Django admin → Listings → "verified"). Local development turns this off.
LISTINGS_REQUIRE_VERIFICATION = env_bool("LISTINGS_REQUIRE_VERIFICATION", default=True)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.DefaultCursorPagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "auth": env_str("THROTTLE_AUTH_RATE", "10/min"),
        "enquiry": env_str("THROTTLE_ENQUIRY_RATE", "10/hour"),
        "public_form": env_str("THROTTLE_PUBLIC_FORM_RATE", "20/hour"),
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
}

# The refresh token lives only in an httpOnly cookie scoped to the auth endpoints,
# so page JavaScript can never read it.
REFRESH_COOKIE_NAME = "pg_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", default=True)
REFRESH_COOKIE_SAMESITE = "Strict"

SPECTACULAR_SETTINGS = {
    "TITLE": "PG Management SaaS API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "MemberRoleEnum": "apps.organizations.models.Role",
        "OwnerIdTypeEnum": "apps.onboarding.models.OwnerVerification.IdType",
        "IdTypeEnum": "apps.tenants.models.Tenant.IdType",
        "PlatformRoleEnum": "apps.platform.models.PlatformRole",
        "GatewayCodeEnum": "apps.subscriptions.models.PaymentGateway.Code",
        "SmsGatewayCodeEnum": "apps.verification.models.SmsGateway.Code",
        "OrganizationStatusEnum": "apps.organizations.models.Organization.Status",
        "BedStatusEnum": "apps.properties.models.Bed.Status",
        "PropertyGenderEnum": "apps.properties.models.Property.Gender",
        "TenantGenderEnum": "apps.tenants.models.Tenant.Gender",
        "StayStatusEnum": "apps.tenants.models.Stay.Status",
        "PlaceKindEnum": "apps.tenants.places.PLACE_KINDS",
        "RoomFeatureChargeEnum": "apps.properties.models.RoomFeature.Charge",
        "AmenityChargeEnum": "apps.amenities.models.PropertyAmenity.Charge",
        "DepositKindEnum": "apps.tenants.models.DepositTransaction.Kind",
        "InvoiceStatusEnum": "apps.billing.models.Invoice.Status",
        "InvoiceLineKindEnum": "apps.billing.models.InvoiceLine.Kind",
        "ComplaintStatusEnum": "apps.operations.models.Complaint.Status",
        "EnquiryStatusEnum": "apps.listings.models.Enquiry.Status",
        "AmenityStatusEnum": "apps.amenities.models.PropertyAmenity.Status",
        "PropertyStatusEnum": "apps.properties.models.Property.Status",
        "VerificationStatusEnum": "apps.properties.models.Property.Verification",
        "RentalUnitStatusEnum": "apps.properties.models.RentalUnit.Status",
        "PropertyDocumentKindEnum": "apps.properties.models.PropertyDocument.Kind",
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env_str("LOG_LEVEL", "INFO")},
}


# ---- Payment gateways for membership plans (keys only from the environment) ----
# Test keys first: Razorpay "rzp_test_…", Cashfree sandbox. Never commit real keys.
APP_BASE_URL = env_str("APP_BASE_URL", "http://localhost:5173")
# Owner sign-up: versions of the Terms and Privacy text people agree to (change when the
# text changes), and how long an email confirmation link works.
TERMS_VERSION = env_str("TERMS_VERSION", "2026-11-draft")
PRIVACY_VERSION = env_str("PRIVACY_VERSION", "2026-11-draft")
EMAIL_LINK_HOURS = 48
RAZORPAY_KEY_ID = env_str("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = env_str("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = env_str("RAZORPAY_WEBHOOK_SECRET", "")
CASHFREE_APP_ID = env_str("CASHFREE_APP_ID", "")
CASHFREE_SECRET_KEY = env_str("CASHFREE_SECRET_KEY", "")
CASHFREE_ENV = env_str("CASHFREE_ENV", "sandbox")  # sandbox | production
PAYTM_MID = env_str("PAYTM_MID", "")
PAYTM_MERCHANT_KEY = env_str("PAYTM_MERCHANT_KEY", "")

# SMS gateways for mobile codes (apps/verification/sms.py). Keys only from the environment.
APITXT_AUTH_KEY = env_str("APITXT_AUTH_KEY", "")
APITXT_TEMPLATE_ID = env_str("APITXT_TEMPLATE_ID", "")
TWOFACTOR_API_KEY = env_str("TWOFACTOR_API_KEY", "")
TWOFACTOR_TEMPLATE = env_str("TWOFACTOR_TEMPLATE", "")
FAST2SMS_API_KEY = env_str("FAST2SMS_API_KEY", "")
FAST2SMS_OTP_ID = env_str("FAST2SMS_OTP_ID", "")
FAST2SMS_SENDER_ID = env_str("FAST2SMS_SENDER_ID", "")
FAST2SMS_MESSAGE_ID = env_str("FAST2SMS_MESSAGE_ID", "")
# Key that encrypts gateway keys typed in the portal (Fernet key). Empty = derived from
# DJANGO_SECRET_KEY. Make one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
SECRETS_KEY = env_str("SECRETS_KEY", "")
# Only with DEBUG on: every code is this value (automatic browser tests). Leave empty otherwise.
SMS_TEST_CODE = env_str("SMS_TEST_CODE", "")
