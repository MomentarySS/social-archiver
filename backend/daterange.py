import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Tuple

_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def parse_day(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    text = str(value).strip()[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except Exception:
        return None


def order_days(
    start: Optional[date],
    end: Optional[date],
) -> Tuple[Optional[date], Optional[date], bool]:
    if start and end and start > end:
        return end, start, True
    return start, end, False


def _local_tz():
    return datetime.now().astimezone().tzinfo or timezone(timedelta(hours=8))


def day_start_utc(day: date) -> datetime:
    aware = datetime(day.year, day.month, day.day, tzinfo=_local_tz())
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def day_end_exclusive_utc(day: date) -> datetime:
    aware = datetime(day.year, day.month, day.day, tzinfo=_local_tz()) + timedelta(days=1)
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def parse_weibo_created_at(created_at: str) -> Optional[datetime]:
    text = (created_at or "").strip()
    if not text:
        return None
    match = re.match(
        r"^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$",
        text,
    )
    if match:
        mon, day, hour, minute, second, offset, year = match.groups()
        month = _MONTHS.get(mon)
        if not month:
            return None
        sign = 1 if offset[0] == "+" else -1
        tz = timezone(timedelta(hours=sign * int(offset[1:3]), minutes=int(offset[3:5])))
        try:
            return datetime(
                int(year), month, int(day),
                int(hour), int(minute), int(second),
                tzinfo=tz,
            )
        except Exception:
            return None
    try:
        return datetime.strptime(text, "%a %b %d %H:%M:%S %z %Y")
    except Exception:
        return None
