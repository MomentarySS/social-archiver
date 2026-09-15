import json
import os
import tempfile
import unittest
from unittest.mock import patch

from backend.cli import _run_download_job
from backend import cli


class BatchRunnerTest(unittest.TestCase):
    def test_run_download_job_requires_fields(self):
        code = _run_download_job({"platform": "weibo"})
        self.assertEqual(code, 1)

    def test_single_download_exits_nonzero_after_error_event(self):
        with patch.object(cli, "download_media", return_value=iter([{"type": "error", "msg": "failed"}])):
            with patch.object(cli.sys, "argv", ["cli.py", "--platform", "weibo", "--user-id", "1", "--output-dir", "out"]):
                with self.assertRaises(SystemExit) as raised:
                    cli.main()
        self.assertEqual(raised.exception.code, 1)


if __name__ == "__main__":
    unittest.main()
