import unittest
from unittest.mock import patch

from backend.cookie_check import check_cookie, check_weibo_cookie


class CookieCheckTest(unittest.TestCase):
    def test_weibo_empty_cookie(self):
        result = check_weibo_cookie("")
        self.assertFalse(result["valid"])
        self.assertIn("未填写", result["message"])

    @patch("backend.cookie_check.requests.get")
    def test_weibo_valid_response(self, mock_get):
        mock_get.return_value.json.return_value = {"ok": 1, "data": {"login": True}}
        mock_get.return_value.status_code = 200
        result = check_weibo_cookie("SUB=abc")
        self.assertTrue(result["valid"])

    @patch("backend.cookie_check.requests.get")
    def test_weibo_not_logged_in(self, mock_get):
        mock_get.return_value.json.return_value = {"ok": 1, "data": {"login": False}}
        mock_get.return_value.status_code = 200
        result = check_weibo_cookie("SUB=abc")
        self.assertFalse(result["valid"])
        self.assertIn("未处于登录状态", result["message"])

    @patch("backend.cookie_check.requests.get")
    def test_weibo_invalid_response(self, mock_get):
        mock_get.return_value.json.return_value = {"ok": 0, "msg": "登录失效"}
        mock_get.return_value.status_code = 200
        result = check_weibo_cookie("SUB=abc")
        self.assertFalse(result["valid"])

    @patch("backend.cookie_check.requests.get")
    def test_weibo_string_data_field(self, mock_get):
        mock_get.return_value.json.return_value = {"ok": 1, "data": "bad"}
        mock_get.return_value.status_code = 200
        result = check_weibo_cookie("SUB=abc")
        self.assertFalse(result["valid"])

    @patch("backend.cookie_check.requests.get")
    def test_weibo_non_object_json(self, mock_get):
        mock_get.return_value.json.return_value = ["oops"]
        mock_get.return_value.status_code = 200
        result = check_weibo_cookie("SUB=abc")
        self.assertFalse(result["valid"])

    def test_check_cookie_routes_twitter(self):
        result = check_cookie("twitter", "")
        self.assertFalse(result["valid"])


if __name__ == "__main__":
    unittest.main()
