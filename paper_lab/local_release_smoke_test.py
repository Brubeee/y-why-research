"""Run the private smoke's preflight without a real OCR runtime."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('local_release_smoke.py')


class SmokeInputsTest(unittest.TestCase):
    def test_formula_only_requires_the_local_worker_configuration(self):
        result = subprocess.run(
            [sys.executable, SCRIPT.with_name('ocr_server.py'), '--formula-only'],
            text=True, capture_output=True, timeout=10,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn('--formula-only requires', result.stderr)

    def test_missing_model_is_a_clear_gate(self):
        with tempfile.TemporaryDirectory() as root:
            result = subprocess.run(
                [sys.executable, SCRIPT, '--formula-python', sys.executable,
                 '--formula-model', Path(root) / 'missing'],
                text=True, capture_output=True, timeout=10,
            )
        self.assertEqual(result.returncode, 2)
        self.assertIn('Pinned model weights not found', result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_different_model_is_rejected_before_starting_worker(self):
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / 'model.safetensors').write_bytes(b'not the pinned model')
            result = subprocess.run(
                [sys.executable, SCRIPT, '--formula-python', sys.executable,
                 '--formula-model', root],
                text=True, capture_output=True, timeout=10,
            )
        self.assertEqual(result.returncode, 2)
        self.assertIn('Pinned model SHA-256 mismatch', result.stderr)
        self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__':
    unittest.main()
