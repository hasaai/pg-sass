from django.conf import settings
from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1: list[URLPattern | URLResolver] = [
    path("", include("core.urls")),
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.organizations.urls")),
    path("", include("apps.amenities.urls")),
    path("", include("apps.properties.urls")),
    path("", include("apps.tenants.urls")),
    path("", include("apps.billing.urls")),
    path("", include("apps.operations.urls")),
    path("", include("apps.listings.urls")),
    path("", include("apps.applications.urls")),
    path("", include("apps.finance.urls")),
    path("", include("apps.reports.urls")),
    path("", include("apps.platform.urls")),
    path("", include("apps.subscriptions.urls")),
    path("", include("apps.verification.urls")),
    path("", include("apps.onboarding.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

urlpatterns: list[URLPattern | URLResolver] = [
    path("admin/", admin.site.urls),
    path("api/v1/", include((api_v1, "v1"), namespace="v1")),
]

if settings.DEBUG:
    urlpatterns += [
        path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="v1:schema"), name="docs"),
        # Development only: public listing photos. Private files are never served here.
        re_path(
            r"^media/(?P<path>public/.*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]
