import json
import os
import tempfile
import unittest

from backend.transcode import (
    h264_output_path,
    is_hevc_file,
    is_h264_file,
    needs_transcode,
    needs_poster,
    poster_output_path,
    _collect_targets,
    _update_post_playback,
    _update_post_poster,
)


def _write_fake_mp4(path: str, brand: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(b"\x00\x00\x00\x18ftyp" + brand + b"\x00" * 128)


class TranscodeTests(unittest.TestCase):
    def test_h264_output_path(self):
        self.assertEqual(h264_output_path("/tmp/a/b/live.mov"), "/tmp/a/b/live_h264.mp4")

    def test_poster_output_path(self):
        self.assertEqual(poster_output_path("/tmp/a/b/clip.mp4"), "/tmp/a/b/clip_poster.jpg")

    def test_needs_poster_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "clip.mp4")
            _write_fake_mp4(path, b"avc1")
            self.assertTrue(needs_poster(path))

    def test_is_hevc_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "live.mp4")
            _write_fake_mp4(path, b"hvc1")
            self.assertTrue(is_hevc_file(path))
            self.assertFalse(is_h264_file(path))

    def test_is_h264_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "clip.mp4")
            _write_fake_mp4(path, b"avc1")
            self.assertTrue(is_h264_file(path))
            self.assertFalse(needs_transcode(path))

    def test_collect_targets_livephoto(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            meta_path = os.path.join(posts, "111.json")
            with open(meta_path, "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "111",
                    "pics": [{
                        "filename": "111_1.jpg",
                        "video_filename": "111_1.mov",
                        "date_folder": "2026-08-28",
                        "type": "livephoto",
                    }],
                }, handle)
            targets = _collect_targets(tmp)
            self.assertEqual(len(targets), 1)
            self.assertTrue(targets[0][2].endswith("111_1.mov"))

    def test_update_post_playback(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            meta_path = os.path.join(posts, "111.json")
            with open(meta_path, "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "111",
                    "pics": [{"filename": "111_1.mov", "type": "video"}],
                }, handle)
            _update_post_playback(meta_path, 0, "filename", "111_1_h264.mp4")
            with open(meta_path, encoding="utf-8") as handle:
                saved = json.load(handle)
            self.assertEqual(saved["pics"][0]["playback_filename"], "111_1_h264.mp4")

    def test_update_post_poster(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            meta_path = os.path.join(posts, "111.json")
            with open(meta_path, "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "111",
                    "pics": [{"filename": "111_1.mp4", "type": "video"}],
                }, handle)
            _update_post_poster(meta_path, 0, "111_1_poster.jpg")
            with open(meta_path, encoding="utf-8") as handle:
                saved = json.load(handle)
            self.assertEqual(saved["pics"][0]["poster_filename"], "111_1_poster.jpg")


if __name__ == "__main__":
    unittest.main()
