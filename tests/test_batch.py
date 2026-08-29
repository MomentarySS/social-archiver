import json
import os
import tempfile
import unittest

from backend.cli import _run_download_job


class BatchRunnerTest(unittest.TestCase):
    def test_run_download_job_requires_fields(self):
        code = _run_download_job({"platform": "weibo"})
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
