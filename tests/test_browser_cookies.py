import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.browser_cookies import (
    build_instagram_cookie,
    build_twitter_cookie,
    build_weibo_cookie,
    import_browser_cookies,
)


class BrowserCookieBuilderTests(unittest.TestCase):
    def test_build_instagram_cookie(self):
        jar = [
            SimpleNamespace(name="sessionid", domain=".instagram.com", value="abc123"),
            SimpleNamespace(name="csrftoken", domain=".instagram.com", value="csrf"),
        ]
        self.assertEqual(
            build_instagram_cookie(jar),
            "sessionid=abc123; csrftoken=csrf",
        )

    def test_build_twitter_cookie(self):
        jar = [
            SimpleNamespace(name="auth_token", domain=".x.com", value="token"),
            SimpleNamespace(name="ct0", domain=".x.com", value="csrf"),
        ]
        self.assertEqual(build_twitter_cookie(jar), "auth_token=token; ct0=csrf")

    def test_build_weibo_cookie(self):
        jar = [SimpleNamespace(name="SUB", domain=".weibo.cn", value="subval")]
        self.assertEqual(build_weibo_cookie(jar), "SUB=subval")


class BrowserCookieImportTests(unittest.TestCase):
    def test_import_reports_permission_error(self):
        with patch("gallery_dl.cookies.load_cookies", side_effect=PermissionError("locked")):
            result = import_browser_cookies("edge", "instagram")
        self.assertFalse(result["ok"])
        self.assertIn("退出", result["error"])


if __name__ == "__main__":
    unittest.main()
