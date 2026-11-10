from typing import Any

from django.db.models import Q, QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view

from apps.operations.models import Complaint, Notice
from apps.operations.serializers import ComplaintSerializer, NoticeSerializer
from core.pagination import ordered_by
from core.params import choice_param, uuid_param
from core.views import OrgScopedModelViewSet


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, required=False, enum=Complaint.Status.values),
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("open", bool, required=False, description="Open or in progress"),
        ]
    )
)
class ComplaintViewSet(OrgScopedModelViewSet):
    """Caretakers log and update complaints; deleting needs complaints.delete."""

    feature = "complaints"

    serializer_class = ComplaintSerializer
    queryset = Complaint.objects.select_related("property", "tenant", "assignee")
    permission_map = {
        "list": "complaints.manage",
        "retrieve": "complaints.manage",
        "create": "complaints.manage",
        "partial_update": "complaints.manage",
        "destroy": "complaints.delete",
    }

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        complaint_status = choice_param(self.request, "status", Complaint.Status.values)
        prop = uuid_param(self.request, "property")
        if complaint_status:
            queryset = queryset.filter(status=complaint_status)
        if prop:
            queryset = queryset.filter(property_id=prop)
        if self.request.query_params.get("open") == "true":
            queryset = queryset.filter(
                status__in=[Complaint.Status.OPEN, Complaint.Status.IN_PROGRESS]
            )
        return queryset


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter("property", str, required=False)])
)
class NoticeViewSet(OrgScopedModelViewSet):
    feature = "notices"
    view_permission = "dashboard.view"
    manage_permission = "notices.manage"
    serializer_class = NoticeSerializer
    pagination_class = ordered_by("-is_pinned", "-created_at")
    queryset = Notice.objects.select_related("property")

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        prop = uuid_param(self.request, "property")
        if prop:
            queryset = queryset.filter(Q(property_id=prop) | Q(property__isnull=True))
        return queryset
