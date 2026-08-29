import json
import os
import tempfile
import unittest

from backend.repair import repair_output_dir


class RepairWeiboTests(unittest.TestCase):
    def test_removes_corrupt_live_mp4(self):
        with tempfile.TemporaryDirectory() as tmp:
            user_dir = os.path.join(tmp, "weibo", "demo")
            date_dir = os.path.join(user_dir, "2024-01-01")
            posts_dir = os.path.join(user_dir, "_posts", "2024-01-01")
            os.makedirs(date_dir)
            os.makedirs(posts_dir)
            bad_mp4 = os.path.join(date_dir, "123_live.mp4")
            with open(bad_mp4, "wb") as handle:
                handle.write(b"x" * 20)
            with open(os.path.join(posts_dir, "123.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "123",
                    "date": "2024-01-01",
                    "pics": [{
                        "filename": "123.jpg",
                        "video_filename": "123_live.mp4",
                        "date_folder": "2024-01-01",
                        "type": "livephoto",
                    }],
                }, handle)
            events = list(repair_output_dir(tmp))
            summary = [e for e in events if e.get("type") == "summary"][-1]
            self.assertGreaterEqual(summary.get("removed_count", 0), 1)
            self.assertFalse(os.path.exists(bad_mp4))


if __name__ == "__main__":
    unittest.main()
