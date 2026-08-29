import json
import os
import tempfile
import unittest

from backend.verify import verify_user_dir


class VerifyArchiveTest(unittest.TestCase):
    def test_verify_ok_text_only_post(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            with open(os.path.join(posts, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({"id": "111", "pics": []}, handle)
            events = list(verify_user_dir(tmp))
            summary = events[-1]
            self.assertEqual(summary["type"], "summary")
            self.assertTrue(summary["ok"])
            self.assertEqual(summary["issue_count"], 0)

    def test_verify_missing_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            with open(os.path.join(posts, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "111",
                    "pics": [{"filename": "111_1.jpg", "date_folder": "2026-08-28"}],
                }, handle)
            events = list(verify_user_dir(tmp))
            issues = [e for e in events if e.get("type") == "missing_media"]
            summary = events[-1]
            self.assertEqual(len(issues), 1)
            self.assertFalse(summary["ok"])


if __name__ == "__main__":
    unittest.main()
