import unittest
from unittest.mock import MagicMock, patch

from backend.cookie_check import check_instagram_cookie


class InstagramCookieCheckTests(unittest.TestCase):
    def test_empty_response_reports_invalid_cookie(self):
        resp = MagicMock()
        resp.status_code = 200
        resp.text = ""
        resp.json.side_effect = ValueError("Expecting value")

        with patch("backend.cookie_check.requests.get", return_value=resp):
            result = check_instagram_cookie("sessionid=abc; csrftoken=csrf")

        self.assertFalse(result["valid"])
        self.assertIn("空响应", result["message"])

    def test_valid_response_with_username(self):
        resp = MagicMock()
        resp.status_code = 200
        resp.text = '{"user":{"username":"demo"}}'
        resp.json.return_value = {"user": {"username": "demo"}}

        with patch("backend.cookie_check.requests.get", return_value=resp) as get_mock:
            result = check_instagram_cookie("sessionid=abc; csrftoken=csrf")

        self.assertTrue(result["valid"])
        self.assertIn("@demo", result["message"])
        headers = get_mock.call_args.kwargs["headers"]
        self.assertIn("sessionid=abc", headers["Cookie"])
        self.assertIn("csrftoken=csrf", headers["Cookie"])
        self.assertEqual(headers["X-CSRFToken"], "csrf")


if __name__ == "__main__":
    unittest.main()
