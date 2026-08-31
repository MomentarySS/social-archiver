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

    def test_normalize_carousel_groups_flat_windows_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_id = "demo"
            user_dir = os.path.join(tmp, user_id)
            date_dir = os.path.join(user_dir, "2026-08-24")
            posts_dir = os.path.join(user_dir, "_posts", "2026-08-24")
            os.makedirs(date_dir)
            os.makedirs(posts_dir)

            sidecar_id = "3970550756822463793"
            slide_ids = ("3970549645636984626", "3970549657590595879", "3970549661273414404")
            for slide_id in slide_ids:
                filename = f"{sidecar_id}_{slide_id}.jpg"
                with open(os.path.join(date_dir, filename), "wb") as handle:
                    handle.write(b"\xff\xd8\xff" + b"\x00" * 128)
                stale = os.path.join(posts_dir, f"{sidecar_id}_{slide_id}.json")
                with open(stale, "w", encoding="utf-8") as handle:
                    json.dump({
                        "id": f"{sidecar_id}_{slide_id}",
                        "platform": "instagram",
                        "user_id": user_id,
                        "pics": [{"filename": filename, "date_folder": "2026-08-24"}],
                    }, handle)

            with open(os.path.join(date_dir, f"{sidecar_id}.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "post_id": sidecar_id,
                    "sidecar_media_id": sidecar_id,
                    "post_shortcode": "DcaOuBfD7Ux",
                    "description": "carousel caption",
                    "date": "2026-08-24 04:42:36",
                    "count": 3,
                    "username": "demo",
                    "fullname": "Demo User",
                }, handle)

            with open(os.path.join(posts_dir, f"{sidecar_id}.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": sidecar_id,
                    "platform": "instagram",
                    "user_id": user_id,
                    "kind": "carousel",
                    "carousel_count": 3,
                    "pics": [],
                    "text": "carousel caption",
                    "date": "2026-08-24",
                }, handle)

            count = _normalize_instagram_archive(tmp, user_id)
            self.assertEqual(count, 1)

            remaining = sorted(
                name for name in os.listdir(posts_dir) if name.endswith(".json")
            )
            self.assertEqual(remaining, [f"{sidecar_id}.json"])

            with open(os.path.join(posts_dir, f"{sidecar_id}.json"), encoding="utf-8") as handle:
                saved = json.load(handle)

            self.assertEqual(saved["kind"], "carousel")
            self.assertEqual(saved["carousel_count"], 3)
            self.assertEqual(saved["text"], "carousel caption")
            self.assertEqual(len(saved["pics"]), 3)
            self.assertEqual(saved["pics"][0]["filename"], f"{sidecar_id}_{slide_ids[0]}.jpg")
            self.assertEqual(saved["pics"][0]["media_id"], slide_ids[0])

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


class InstagramGalleryDlErrorTests(unittest.TestCase):
    def test_story_not_found_is_not_user_error(self):
        from backend.instagram import _map_gallery_dl_error

        self.assertIsNone(_map_gallery_dl_error("Requested story could not be found"))

    def test_http_404_is_not_user_error(self):
        from backend.instagram import _map_gallery_dl_error

        self.assertIsNone(
            _map_gallery_dl_error("'404 Not Found' for 'https://www.instagram.com/api/v1/clips/user/'"),
        )

    def test_user_not_found_maps_message(self):
        from backend.instagram import _map_gallery_dl_error

        mapped = _map_gallery_dl_error("Requested user could not be found")
        self.assertIn("找不到该用户", mapped or "")

    def test_rate_limit_does_not_abort_download(self):
        from backend.instagram import _map_gallery_dl_line

        state = {"rate_limited": False}
        self.assertIsNone(_map_gallery_dl_line("'429 Too Many Requests' for 'https://i.instagram.com/…'", state))
        self.assertTrue(state["rate_limited"])

    def test_rate_limit_not_mapped_as_fatal_error(self):
        from backend.instagram import _map_gallery_dl_error

        self.assertIsNone(_map_gallery_dl_error("'429 Too Many Requests' for 'https://i.instagram.com/…'"))


if __name__ == "__main__":
    unittest.main()
