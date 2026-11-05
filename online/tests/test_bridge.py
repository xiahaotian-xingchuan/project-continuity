import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("bridge", Path(__file__).resolve().parents[1] / "bridge/save_deliverables.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def test_binary_save_and_manual_change_conflict(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            content = b"PK\x00binary document"
            artifact = {"path": "治理/总纲.docx", "sha256": hashlib.sha256(content).hexdigest()}
            receipts = {}
            status, path = bridge.save_one(root, artifact, content, receipts)
            self.assertEqual(status, "saved")
            self.assertEqual(path.read_bytes(), content)
            path.write_bytes(b"manual changes")
            self.assertEqual(bridge.save_one(root, artifact, content, receipts)[0], "conflict")
            self.assertEqual(path.read_bytes(), b"manual changes")

    def test_escape_and_hash_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in ("../outside", "/tmp/outside", "C:/outside"):
                with self.assertRaises(ValueError):
                    bridge.target_path(root, relative)
            with self.assertRaises(ValueError):
                bridge.save_one(root, {"path": "file.docx", "sha256": "wrong"}, b"bytes", {})
