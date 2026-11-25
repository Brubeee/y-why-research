"""Local exploratory 2x2x2 comparison on the already observed fraction fixture."""
from dataclasses import replace
from hashlib import sha256
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from itertools import product
from io import BytesIO
import json
import re
import subprocess
import threading

from PIL import Image
from ocr_fixtures import PAGES, render
from ocr_server import Handler

FIXTURE = next(p for p in PAGES if p.id == 'fraction-rotated')
# One question-sized window, fixed before scoring and unchanged across inputs.
WINDOW = (98, 274, 680, 670)
FORMATS = {'PNG': ('image/png', {}), 'JPEG': ('image/jpeg', {'quality': 72, 'subsampling': 2})}


def encode(image, fmt):
    out = BytesIO()
    image.save(out, fmt, **FORMATS[fmt][1])
    return out.getvalue()


def compact(text):
    # Keep digit-to-digit spaces and all signs. Not symbolic equivalence.
    return re.sub(r'(?<!\d)\s+|\s+(?!\d)', '', text.replace('−', '-'))


def score(active, lines, dx, dy):
    reported = []
    matches = [[] for _ in active]
    for index, line in enumerate(lines):
        b = line['box']
        x, y = b['x'] + dx, b['y'] + dy
        candidates = []
        for i, row in enumerate(active):
            a = row['box']
            height = min(y+b['height'], a['y']+a['height']) - max(y,a['y'])
            width = min(x+b['width'], a['x']+a['width']) - max(x,a['x'])
            if height > a['height']/2 and width > 0:
                candidates.append(i)
                matches[i].append(index)
        reported.append({'text': line['text'], 'overlaps_active': [i+1 for i in candidates]})
    mapping, exact, missing, ambiguous = [], [], [], []
    for i, indices in enumerate(matches):
        if not indices:
            missing.append(i+1)
        elif len(indices) != 1 or len(reported[indices[0]]['overlaps_active']) != 1:
            ambiguous.append(i+1)
        else:
            j = indices[0]
            mapping.append((i+1, j+1))
            if compact(lines[j]['text']) == compact(active[i]['text']):
                exact.append(i+1)
    complete = len(mapping) == len(active) and all(b[1] == a[1]+1 for a,b in zip(mapping,mapping[1:]))
    return dict(mapping=mapping, exact_active=exact, missing_active=missing,
                ambiguous_active=ambiguous, consecutive_complete=complete, detected=reported)


def inspect(port, data, mime, dimensions):
    with_response = HTTPConnection('127.0.0.1', port, timeout=25)
    try:
        with_response.request('POST', '/api/ocr', data, {'Content-Type': mime})
        response = with_response.getresponse()
        report = json.loads(response.read())
        if (response.status != 200 or report.get('status') != 'draft' or
                tuple(report['image'][axis] for axis in ('width','height')) != dimensions):
            raise RuntimeError('Loopback response did not match the requested raster')
        return report['lines']
    finally:
        with_response.close()


def run():
    cases = []
    with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for angle in (FIXTURE.angle, 0):
                image, labels = render(replace(FIXTURE, angle=angle))
                active = [r for r in labels if r['status'] == 'active']
                for row in active:
                    b = row['box']
                    l,t,r,d = WINDOW
                    if not (l <= b['x'] and t <= b['y'] and
                            b['x']+b['width'] <= r and b['y']+b['height'] <= d):
                        raise ValueError('Predetermined window does not cover the full chain')
                rgb_hash = sha256(image.tobytes()).hexdigest()
                for original_fmt, cropped in product(FORMATS, (False, True)):
                    data = encode(image, original_fmt)
                    with Image.open(BytesIO(data)) as decoded:
                        if decoded.getexif():
                            raise ValueError('Unexpected EXIF in synthetic input')
                        if cropped:
                            frame = decoded.convert('RGB').crop(WINDOW)
                            data, fmt = encode(frame, 'PNG'), 'PNG'
                            dx,dy = WINDOW[:2]
                        else:
                            frame, fmt, dx, dy = decoded, original_fmt, 0, 0
                        lines = inspect(server.server_port, data, FORMATS[fmt][0], frame.size)
                    cases.append(dict(angle=angle, original=original_fmt, cropped=cropped,
                                      rgb_sha256=rgb_hash, upload_sha256=sha256(data).hexdigest(),
                                      **score(active, lines, dx, dy)))
        finally:
            server.shutdown()
            thread.join()
    version = subprocess.check_output(['tesseract','--version'],text=True).splitlines()[0]
    return dict(fixture=FIXTURE.id, crop=WINDOW, engine=version, cases=cases)


if __name__ == '__main__':
    print(json.dumps(run(), indent=2, ensure_ascii=False))
