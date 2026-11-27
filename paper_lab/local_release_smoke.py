#!/usr/bin/env python3
"""Reproduce the private, synthetic photo-to-practice smoke on Linux."""
import argparse
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


def synthetic_page(path):
    page = Image.new('RGB', (576, 768), 'white')
    draw = ImageDraw.Draw(page)
    font = ImageFont.truetype('DejaVuSans.ttf', 37)
    # The middle line intentionally changes the solution set.
    for i, line in enumerate(('7x+4=53', '7x=48', 'x=7')):
        draw.text((85, 220 + 66*i), line, fill='black', font=font)
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
    model = args.formula_model.resolve(strict=True)
    if not worker_python.is_file() or not (model / 'model.safetensors').is_file():
        parser.error('Point to an existing worker Python and pinned local model.')
    with tempfile.TemporaryDirectory(prefix='ywhy-release-smoke-') as tmp:
        fixture = Path(tmp) / 'synthetic.jpg'
        synthetic_page(fixture)
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
