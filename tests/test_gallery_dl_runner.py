import unittest

from backend.gallery_dl_runner import (
    GalleryDlStats,
    apply_date_range,
    looks_like_path,
)


class GalleryDlRunnerTests(unittest.TestCase):
    def test_looks_like_path(self):
        self.assertTrue(looks_like_path("C:/archives/twitter/user/2024-01-01/1_1.jpg"))
        self.assertFalse(looks_like_path("# comment"))
        self.assertFalse(looks_like_path("meta.json"))

    def test_apply_date_range_swapped(self):
        cfg = {}
        msg = apply_date_range(cfg, "2024-02-01", "2024-01-01")
        self.assertEqual(msg, "起始日晚于结束日，已按从早到晚对调。")
        self.assertIn("date-after", cfg)
        self.assertIn("date-before", cfg)

    def test_gallery_dl_stats_defaults(self):
        stats = GalleryDlStats()
        self.assertEqual(stats.total, 0)
        self.assertIsNone(stats.fatal_msg)


if __name__ == "__main__":
    unittest.main()
