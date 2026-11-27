#!/usr/bin/env python3
"""Reproduce the private, synthetic photo-to-practice smoke on Linux."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PINNED_WEIGHTS_SHA256 = "a16eb0de98d199293371c560f95f83130d2a2c9612449df16839f08ff9498815"


def synthetic_page(path, *, camera_dimensions=False):
    page = Image.new('RGB', (576, 768), 'white')
    draw = ImageDraw.Draw(page)
    font = ImageFont.truetype('DejaVuSans.ttf', 37)
    # The middle line intentionally changes the solution set.
    for i, line in enumerate(('7x+4=53', '7x=48', 'x=7')):
        draw.text((85, 220 + 66*i), line, fill='black', font=font)
    if camera_dimensions:
        # Nominal 12 MP portrait image, not a real phone capture.
        page = page.resize((3024, 4032), Image.Resampling.LANCZOS)
    page.save(path, format='JPEG', quality=92)


def server_port(server):
    with selectors.DefaultSelector() as sel:
        sel.register(server.stdout, selectors.EVENT_READ)
        if not sel.select(timeout=10):
            raise RuntimeError('The private loopback server did not start.')
    found = re.fullmatch(rb'Y\? Paper Lab: http://127\.0\.0\.1:(\d+)/paper_lab/\n',
                        server.stdout.readline())
    if not found:
        raise RuntimeError('Could not verify the private loopback endpoint.')
    return int(found[1])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--formula-python', type=Path, required=True)
    parser.add_argument('--formula-model', type=Path, required=True)
    args = parser.parse_args()
    # Keep the executable symlink: resolving it can bypass its virtualenv.
    worker_python = args.formula_python.absolute()
    if not worker_python.is_file() or not os.access(worker_python, os.X_OK):
        parser.error('Worker Python is missing or not executable.')
    model = args.formula_model.resolve()
    weights = model / 'model.safetensors'
    if not weights.is_file():
        parser.error('Pinned model weights not found. Provision the documented local snapshot first.')
    digest = hashlib.sha256()
    try:
        with weights.open('rb') as source:
            for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
                digest.update(block)
    except OSError:
        parser.error('Pinned model weights could not be read.')
    if digest.hexdigest() != PINNED_WEIGHTS_SHA256:
        parser.error('Pinned model SHA-256 mismatch. The private OCR smoke did not start.')
    with tempfile.TemporaryDirectory(prefix='ywhy-release-smoke-') as tmp:
        fixture = Path(tmp) / 'synthetic.jpg'
        synthetic_page(fixture, camera_dimensions=True)
        with subprocess.Popen(
            [sys.executable, HERE / 'ocr_server.py', '--port', '0',
             '--formula-python', worker_python, '--formula-model', model],
            cwd=HERE.parent, stdout=subprocess.PIPE, start_new_session=True,
        ) as server:
            try:
                port = server_port(server)
                env = {**os.environ, 'YWHY_FORMULA_SMOKE_PORT': str(port),
                       'YWHY_FORMULA_SMOKE_JPEG': str(fixture)}
                tests = sorted(HERE.glob('*.test.mjs')) + sorted((HERE / 'math_ocr_probe').glob('*.test.mjs'))
                subprocess.run(['node', '--test', *tests], cwd=HERE.parent,
                               env=env, timeout=200, check=True)
            finally:
                if server.poll() is None:
                    # Let main's finally close the existing worker on a clean exit.
                    server.send_signal(signal.SIGINT)
                    try:
                        server.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        # The process group belongs to this smoke only; kill a
                        # stuck inference child as well as the local server.
                        os.killpg(server.pid, signal.SIGKILL)
                        server.wait(timeout=5)


if __name__ == '__main__':
    main()
