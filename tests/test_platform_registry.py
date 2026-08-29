import unittest

from backend.platforms.registry import PLATFORMS, download_for_platform


class PlatformRegistryTests(unittest.TestCase):
    def test_platform_list(self):
        self.assertEqual(PLATFORMS, ["twitter", "weibo", "instagram"])

    def test_unknown_platform(self):
        with self.assertRaises(ValueError):
            list(download_for_platform("unknown", user_id="x", cookie="", output_dir="/tmp"))


if __name__ == "__main__":
    unittest.main()
