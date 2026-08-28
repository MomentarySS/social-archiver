import unittest
from datetime import date

from backend.daterange import order_days, parse_day, parse_weibo_created_at


class DateRangeTest(unittest.TestCase):
    def test_parse_day(self):
        self.assertEqual(parse_day("2026-08-28"), date(2026, 8, 28))
        self.assertIsNone(parse_day(""))
        self.assertIsNone(parse_day("nope"))

    def test_order_days_swaps_when_start_after_end(self):
        start, end, swapped = order_days(date(2026, 8, 28), date(2026, 8, 1))
        self.assertEqual(start, date(2026, 8, 1))
        self.assertEqual(end, date(2026, 8, 28))
        self.assertTrue(swapped)

    def test_order_days_keeps_order(self):
        start, end, swapped = order_days(date(2026, 1, 1), date(2026, 1, 2))
        self.assertEqual(start, date(2026, 1, 1))
        self.assertFalse(swapped)

    def test_parse_weibo_created_at(self):
        dt = parse_weibo_created_at("Fri Aug 28 15:04:05 +0800 2026")
        self.assertIsNotNone(dt)
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 8)
        self.assertEqual(dt.day, 28)


if __name__ == "__main__":
    unittest.main()
