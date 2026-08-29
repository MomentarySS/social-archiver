import json
import os
import tempfile
import unittest

from backend.instagram import _finalize_instagram_post, _normalize_instagram_archive


class InstagramCarouselTests(unittest.TestCase):
    def test_normalize_carousel_groups_subfolder_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_id = "demo"
            user_dir = os.path.join(tmp, user_id)
            date_dir = os.path.join(user_dir, "2024-01-01")
            carousel_dir = os.path.join(date_dir, "1000")
            posts_dir = os.path.join(user_dir, "_posts", "2024-01-01")
            os.makedirs(carousel_dir)
            os.makedirs(posts_dir)

            for media_id in ("1001", "1002", "1003"):
                with open(os.path.join(carousel_dir, f"{media_id}.jpg"), "wb") as handle:
                    handle.write(b"\xff\xd8\xff" + b"\x00" * 128)

            with open(os.path.join(date_dir, "1000.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "post_id": "1000",
                    "sidecar_media_id": "1000",
                    "post_shortcode": "ABC123",
                    "description": "carousel caption",
                    "date": "2024-01-01",
                    "count": 3,
                    "username": "demo",
                    "fullname": "Demo User",
                }, handle)

            count = _normalize_instagram_archive(tmp, user_id)
            self.assertEqual(count, 1)

            with open(os.path.join(posts_dir, "1000.json"), encoding="utf-8") as handle:
                saved = json.load(handle)

            self.assertEqual(saved["kind"], "carousel")
            self.assertEqual(saved["carousel_count"], 3)
            self.assertEqual(saved["text"], "carousel caption")
            self.assertEqual(saved["post_shortcode"], "ABC123")
            self.assertEqual(len(saved["pics"]), 3)
            self.assertEqual(saved["pics"][0]["carousel_index"], 1)
            self.assertEqual(saved["pics"][2]["carousel_total"], 3)
            self.assertEqual(saved["pics"][0]["filename"], "1000/1001.jpg")
            self.assertEqual(saved["pics"][0]["date_folder"], "2024-01-01")

    def test_normalize_single_media_post(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_id = "demo"
            user_dir = os.path.join(tmp, user_id)
            date_dir = os.path.join(user_dir, "2024-02-02")
            posts_dir = os.path.join(user_dir, "_posts", "2024-02-02")
            os.makedirs(date_dir)
            os.makedirs(posts_dir)

            with open(os.path.join(date_dir, "2000.jpg"), "wb") as handle:
                handle.write(b"\xff\xd8\xff" + b"\x00" * 128)
            with open(os.path.join(date_dir, "2000.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "post_id": "2000",
                    "description": "single image",
                    "date": "2024-02-02",
                    "count": 1,
                    "post_shortcode": "XYZ999",
                }, handle)

            count = _normalize_instagram_archive(tmp, user_id)
            self.assertEqual(count, 1)

            with open(os.path.join(posts_dir, "2000.json"), encoding="utf-8") as handle:
                saved = json.load(handle)

            self.assertEqual(saved["kind"], "media")
            self.assertEqual(saved["text"], "single image")
            self.assertEqual(len(saved["pics"]), 1)
            self.assertEqual(saved["pics"][0]["filename"], "2000.jpg")
            self.assertEqual(saved["pics"][0]["carousel_total"], 1)

    def test_finalize_sorts_by_index(self):
        post = {
            "id": "1",
            "pics": [
                {"filename": "b.jpg", "index": 2},
                {"filename": "a.jpg", "index": 1},
            ],
        }
        _finalize_instagram_post(post)
        self.assertEqual(post["kind"], "carousel")
        self.assertEqual(post["pics"][0]["filename"], "a.jpg")
        self.assertEqual(post["pics"][1]["carousel_index"], 2)

    def test_apply_story_kind(self):
        from backend.instagram import _apply_instagram_payload, _empty_instagram_post
        post = _empty_instagram_post("900", "demo")
        _apply_instagram_payload(post, {"type": "story", "description": "story text"}, "demo")
        self.assertEqual(post["kind"], "story")
        self.assertEqual(post["text"], "story text")


if __name__ == "__main__":
    unittest.main()
