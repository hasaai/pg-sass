from django.urls import path

from apps.onboarding import views

urlpatterns = [
    path("auth/signup/start", views.SignupStartView.as_view(), name="signup-start"),
    path("auth/signup/finish", views.SignupFinishView.as_view(), name="signup-finish"),
    path(
        "auth/login/mobile/start", views.MobileLoginStartView.as_view(), name="login-mobile-start"
    ),
    path(
        "auth/login/mobile/finish",
        views.MobileLoginFinishView.as_view(),
        name="login-mobile-finish",
    ),
    path("auth/email/send", views.EmailSendView.as_view(), name="email-send"),
    path("auth/email/confirm", views.EmailConfirmView.as_view(), name="email-confirm"),
    path("onboarding/profile", views.ProfileView.as_view(), name="onboarding-profile"),
    path("onboarding/owner-check", views.OwnerCheckView.as_view(), name="owner-check"),
    path(
        "onboarding/owner-check/submit",
        views.OwnerCheckSubmitView.as_view(),
        name="owner-check-submit",
    ),
    path(
        "onboarding/owner-check/documents",
        views.OwnerDocumentsView.as_view(),
        name="owner-check-documents",
    ),
    path(
        "onboarding/owner-check/documents/<uuid:pk>",
        views.OwnerDocumentView.as_view(),
        name="owner-check-document",
    ),
    path(
        "onboarding/owner-check/documents/<uuid:pk>/download",
        views.OwnerDocumentDownloadView.as_view(),
        name="owner-check-document-download",
    ),
]
