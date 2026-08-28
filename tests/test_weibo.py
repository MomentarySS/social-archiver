import json
import os
import tempfile
import unittest

from backend.weibo import (
    EXISTING_STREAK_STOP,
    _archive_post_complete,
    _is_original,
    _is_pinned,
    _iter_mblog_cards,
)


class WeiboHelpersTest(unittest.TestCase):
    def test_existing_streak_stop_is_small_positive(self):
        self.assertGreaterEqual(EXISTING_STREAK_STOP, 3)
        self.assertLessEqual(EXISTING_STREAK_STOP, 10)

    def test_is_original_skips_retweets(self):
        self.assertFalse(_is_original({"retweeted_status": {"id": "1"}, "user": {"id": "9"}}, "9"))
        self.assertTrue(_is_original({"user": {"id": "9"}}, "9"))

    def test_is_pinned(self):
        self.assertTrue(_is_pinned({"isTop": "1"}))
        self.assertTrue(_is_pinned({"title": {"text": "置顶微博"}}))
        self.assertFalse(_is_pinned({"title": {"text": "普通"}}))

    def test_iter_mblog_cards_nested(self):
        cards = _iter_mblog_cards([
            {"card_type": "9", "mblog": {"id": "1"}},
            {"card_group": [{"card_type": "9", "mblog": {"id": "2"}}]},
            {"card_type": "11"},
        ])
        self.assertEqual([c["mblog"]["id"] for c in cards], ["1", "2"])

    def test_archive_complete_text_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            with open(os.path.join(posts, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({"id": "111", "pics": []}, handle)
            self.assertTrue(_archive_post_complete(tmp, "2026-08-28", "111"))
            self.assertFalse(_archive_post_complete(tmp, "2026-08-28", "missing"))

    def test_archive_incomplete_when_media_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            with open(os.path.join(posts, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "111",
                    "pics": [{"filename": "111_1.jpg", "date_folder": "2026-08-28"}],
                }, handle)
            self.assertFalse(_archive_post_complete(tmp, "2026-08-28", "111"))


if __name__ == "__main__":
    unittest.main()
