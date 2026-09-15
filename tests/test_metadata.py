import json
import os
import tempfile
import unittest

from backend.metadata import save_post_metadata, save_profile


class MetadataWriteTests(unittest.TestCase):
    def test_post_metadata_is_valid_and_leaves_no_temporary_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            save_post_metadata(tmp, "user", {"id": "42", "date": "2026-09-06", "text": "hello"})
            target_dir = os.path.join(tmp, "user", "_posts", "2026-09-06")
            target = os.path.join(target_dir, "42.json")
            with open(target, encoding="utf-8") as handle:
                self.assertEqual(json.load(handle)["text"], "hello")
            self.assertEqual([name for name in os.listdir(target_dir) if name.endswith(".tmp")], [])

    def test_profile_update_preserves_existing_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            save_profile(tmp, "user", {"platform": "weibo", "name": "old"})
            save_profile(tmp, "user", {"name": "new", "lastPage": 3})
            with open(os.path.join(tmp, "user", "_profile.json"), encoding="utf-8") as handle:
                profile = json.load(handle)
            self.assertEqual(profile["name"], "new")
            self.assertEqual(profile["platform"], "weibo")
            self.assertEqual(profile["lastPage"], 3)


if __name__ == "__main__":
    unittest.main()
