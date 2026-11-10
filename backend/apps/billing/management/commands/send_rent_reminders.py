"""Email rent reminders for due and overdue invoices (all organizations).

Schedule it once a day, e.g. with cron:
    15 9 * * *  cd /app/backend && python manage.py send_rent_reminders
Each invoice gets at most one email every 3 days.
"""

from typing import Any

from django.core.management.base import BaseCommand

from apps.billing import reminders


class Command(BaseCommand):
    help = "Email rent reminders for due and overdue invoices (at most every 3 days per invoice)."

    def handle(self, *args: Any, **options: Any) -> None:
        results = reminders.run_automatic()
        self.stdout.write(
            "Reminders: {sent} sent, {skipped_recent} reminded recently, "
            "{no_email} without email, {failed} failed".format(**results)
        )
