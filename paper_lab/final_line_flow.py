"""Exercise final-line recovery on two rendered papers via real local OCR."""
from base64 import b64encode
from dataclasses import replace
from hashlib import sha256
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import threading

from fraction_failure_probe import FIXTURE, WINDOW, encode
from ocr_fixtures import render
from ocr_server import Handler


def fixture(value):
    end = replace(FIXTURE.rows[-1], text=f'q = {value}',
                  transition='valid' if value == 2 else 'invalid')
    page = replace(FIXTURE, angle=0, rows=(*FIXTURE.rows[:-1], end))
    image, labels = render(page)
    full, crop = encode(image, 'PNG'), encode(image.crop(WINDOW), 'PNG')
    pack = lambda data: b64encode(data).decode('ascii')
    return dict(width=image.width, height=image.height,
                full=pack(full), crop=pack(crop), raw_sha256=sha256(full).hexdigest(),
                rows=[label['text'] for label in labels if label['status'] == 'active'],
                first_error=None if value == 2 else 3)


def run():
    cases = [fixture(n) for n in (2, 3)]
    assert cases[0]['raw_sha256'] != cases[1]['raw_sha256']
    assert cases[0]['crop'] != cases[1]['crop']
    with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            proc = subprocess.run(['node', str(Path(__file__).with_suffix('.mjs'))],
                input=json.dumps(dict(port=server.server_port, window=WINDOW, cases=cases)),
                encoding='utf-8', capture_output=True, timeout=100)
            if proc.returncode:
                raise RuntimeError(proc.stderr)
            return json.loads(proc.stdout)
        finally:
            server.shutdown()
            thread.join()


if __name__ == '__main__':
    print(json.dumps(run(), indent=2, ensure_ascii=False))
