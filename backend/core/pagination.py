from rest_framework.pagination import CursorPagination, PageNumberPagination


class DefaultCursorPagination(CursorPagination):
    """Cursor pagination: stable under inserts and fast on large tables."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"


def ordered_by(*fields: str) -> type[DefaultCursorPagination]:
    """Cursor pagination with a list-specific order (fields must live on the model itself)."""
    return type(
        f"CursorPagination_{'_'.join(f.strip('-') for f in fields)}",
        (DefaultCursorPagination,),
        {"ordering": fields},
    )


class NumberedPagination(PageNumberPagination):
    """Page numbers with a total count, for admin tables ("page 3 of 12")."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
