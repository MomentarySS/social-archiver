import json
import os
import tempfile
import unittest

from backend.twitter import (
    _apply_twitter_post_kind,
    _build_quote_parent_map,
    _maybe_mark_quote_from_text,
    _normalize_twitter_archive,
)


class TwitterReplyTests(unittest.TestCase):
    def test_apply_reply_kind(self):
        post = {"id": "100", "pics": [{"index": 1, "filename": "100_1.jpg"}]}
        payload = {"reply_id": 999, "reply_to": "someone"}
        _apply_twitter_post_kind(post, payload)
        self.assertFalse(post["original"])
        self.assertEqual(post["kind"], "reply")
        self.assertEqual(post["in_reply_to_id"], "999")
        self.assertEqual(post["in_reply_to_user"], "someone")

    def test_apply_original_kind(self):
        post = {"id": "100", "pics": []}
        _apply_twitter_post_kind(post, {})
        self.assertTrue(post["original"])
        self.assertEqual(post["kind"], "text")

    def test_mark_quote_from_text(self):
        post = {
            "id": "100",
            "text": "look https://x.com/someone/status/999",
            "pics": [],
        }
        _maybe_mark_quote_from_text(post)
        self.assertEqual(post["kind"], "quote")
        self.assertEqual(post["quoted_from_user"], "someone")
        self.assertEqual(post["quoted_from_id"], "999")

    def test_build_quote_parent_map(self):
        json_by_id = {
            "200": {"quote_by": "demo", "quote_id": 100, "author": {"name": "quoted"}},
            "100": {"content": "my quote"},
        }
        parents, drop_ids = _build_quote_parent_map(json_by_id, "demo")
        self.assertIn("100", parents)
        self.assertEqual(parents["100"]["quoted_from_user"], "quoted")
        self.assertIn("200", drop_ids)

    def test_normalize_marks_pinned(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_id = "demo"
            user_dir = os.path.join(tmp, user_id)
            date_dir = os.path.join(user_dir, "2024-01-01")
            posts_dir = os.path.join(user_dir, "_posts", "2024-01-01")
            os.makedirs(date_dir)
            os.makedirs(posts_dir)
            with open(os.path.join(date_dir, "100.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "tweet_id": "100",
                    "date": "2024-01-01",
                    "content": "pinned post",
                    "pinned": True,
                    "author": {"name": "demo", "nick": "Demo"},
                }, handle)
            count = _normalize_twitter_archive(tmp, user_id)
            self.assertEqual(count, 1)
            with open(os.path.join(posts_dir, "100.json"), encoding="utf-8") as handle:
                saved = json.load(handle)
            self.assertTrue(saved.get("pinned"))

    def test_normalize_forced_bookmark_kind(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_id = "demo--bookmarks"
            user_dir = os.path.join(tmp, user_id)
            date_dir = os.path.join(user_dir, "2024-01-01")
            posts_dir = os.path.join(user_dir, "_posts", "2024-01-01")
            os.makedirs(date_dir)
            os.makedirs(posts_dir)
            with open(os.path.join(date_dir, "100.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "tweet_id": "100",
                    "date": "2024-01-01",
                    "content": "saved bookmark",
                    "author": {"name": "someone", "nick": "Someone"},
                }, handle)
            count = _normalize_twitter_archive(tmp, user_id, forced_kind="bookmark")
            self.assertEqual(count, 1)
            with open(os.path.join(posts_dir, "100.json"), encoding="utf-8") as handle:
                saved = json.load(handle)
            self.assertEqual(saved.get("kind"), "bookmark")
            self.assertFalse(saved.get("original"))

    def test_split_twitter_user_id(self):
        from backend.twitter import _split_twitter_user_id
        self.assertEqual(_split_twitter_user_id("amd--bookmarks"), ("amd", "bookmarks", "amd--bookmarks"))
        self.assertEqual(_split_twitter_user_id("amd--likes"), ("amd", "likes", "amd--likes"))
        self.assertEqual(_split_twitter_user_id("amd"), ("amd", "original", "amd"))

    def test_normalize_filters_media_only_replies(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_id = "demo"
            user_dir = os.path.join(tmp, user_id)
            date_dir = os.path.join(user_dir, "2024-01-01")
            posts_dir = os.path.join(user_dir, "_posts", "2024-01-01")
            os.makedirs(date_dir)
            os.makedirs(posts_dir)

            with open(os.path.join(date_dir, "111_1.jpg"), "wb") as handle:
                handle.write(b"\xff\xd8\xff" + b"\x00" * 128)
            with open(os.path.join(date_dir, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "tweet_id": "111",
                    "date": "2024-01-01",
                    "content": "reply with media",
                    "reply_id": 42,
                    "reply_to": "target",
                    "author": {"name": "demo", "nick": "Demo"},
                }, handle)
            with open(os.path.join(date_dir, "222.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "tweet_id": "222",
                    "date": "2024-01-01",
                    "content": "text-only reply",
                    "reply_id": 43,
                    "reply_to": "target",
                    "author": {"name": "demo", "nick": "Demo"},
                }, handle)

            count = _normalize_twitter_archive(tmp, user_id, replies_media_only=True)
            self.assertEqual(count, 1)
            with open(os.path.join(posts_dir, "111.json"), encoding="utf-8") as handle:
                saved = json.load(handle)
            self.assertEqual(saved["kind"], "reply")
            self.assertFalse(os.path.exists(os.path.join(posts_dir, "222.json")))


if __name__ == "__main__":
    unittest.main()
