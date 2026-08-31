import unittest
from unittest.mock import patch

from backend.platforms.registry import PLATFORMS, download_for_platform


class PlatformRegistryTests(unittest.TestCase):
    def test_platform_list(self):
        self.assertEqual(PLATFORMS, ["twitter", "weibo", "instagram"])

    def test_unknown_platform(self):
        with self.assertRaises(ValueError):
            list(download_for_platform("unknown", user_id="x", cookie="", output_dir="/tmp"))

    def test_filters_platform_specific_kwargs(self):
        with patch("backend.platforms.registry._load_downloaders") as load:
            def fake_weibo(user_id, cookie, output_dir, include_quoted=False):
                yield {"type": "done", "kwargs": {"user_id": user_id, "include_quoted": include_quoted}}

            load.return_value = {"weibo": fake_weibo}
            events = list(download_for_platform(
                "weibo",
                user_id="1",
                cookie="SUB=1",
                output_dir="/tmp",
                include_replies=True,
                include_quoted=True,
            ))
        self.assertEqual(events[0]["kwargs"]["include_quoted"], True)
        self.assertNotIn("include_replies", events[0]["kwargs"])


if __name__ == "__main__":
    unittest.main()
