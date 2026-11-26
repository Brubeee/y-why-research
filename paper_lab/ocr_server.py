#!/usr/bin/env python3
"""Private loopback static app + Tesseract draft OCR. No cloud services."""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
from formula_worker import FormulaWorker, WorkerError

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MAX_BYTES = 4_000_000  # Mirrors Paper Lab client; stays below 4.5 MB ingress.
MAX_PIXELS = 12_000_000
MAX_SIDE = 7000
OCR_TIMEOUT = 20
RUNNERS = threading.BoundedSemaphore(2)
MIMES = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
         '.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
         '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'}
LAB = {'index.html','style.css','app.mjs','diagnostic.mjs','verify.mjs','memex.mjs',
       'crop.mjs','expansion_form.mjs','delayed_review.mjs','curriculum.mjs','operation_claim.mjs'}
FORMULA_MODULES = {'glm_page_draft.mjs','affine_scope.mjs'}
PROTOTYPE = {'typed-equations.html','typed-equations.js','typed-equations.css'}
NAME = re.compile(r'^[a-zA-Z0-9_.-]+$')
PNG = b'\x89PNG\r\n\x1a\n'
JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
DISCLAIMERS = [
    "Draft text only. Confirm the transcription, line order, and every mathematical symbol against the photo.",
    "Confidence reflects text recognition, not mathematical correctness. Handwriting accuracy has not been established.",
]

class Rejected(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code

def image_info(data, mime):
    """Read basic dimensions before letting the OCR process decode an image."""
    if mime == 'image/png':
        if (len(data) < 33 or not data.startswith(PNG)
                or data[8:16] != b'\x00\x00\x00\x0dIHDR'):
            raise Rejected(415, 'The bytes are not a PNG image.')
        w, h = struct.unpack_from('>II', data, 16)
        ext = '.png'
    elif mime == 'image/jpeg':
        if not data.startswith(b'\xff\xd8\xff'):
            raise Rejected(415, 'The bytes are not a JPEG image.')
        ext = '.jpg'
        pos, w, h = 2, 0, 0
        while pos < len(data) and data[pos] == 255:
            while pos < len(data) and data[pos] == 255:
                pos += 1
            if pos >= len(data):
                break
            m = data[pos]
            pos += 1
            if m in (0xDA, 0xD9):
                break
            if m == 1 or 0xD0 <= m <= 0xD7:
                continue
            if pos + 2 > len(data):
                break
            length = struct.unpack_from('>H', data, pos)[0]
            if length < 2 or pos + length > len(data):
                break
            if m in JPEG_SOF and length >= 8:
                h, w = struct.unpack_from('>HH', data, pos + 3)
                break
            pos += length
        if not (w and h):
            raise Rejected(422, 'JPEG dimensions could not be read.')
    else:
        raise Rejected(415, 'Send a raw PNG or JPEG image.')
    if not w or not h:
        raise Rejected(422, 'Image dimensions are invalid.')
    if max(w, h) > MAX_SIDE or w*h > MAX_PIXELS:
        raise Rejected(413, 'Image is too large to decode. Resize it and try again.')
    return ext, w, h

def box(x, y, w, h):
    return {'x':x,'y':y,'width':w,'height':h}

def parse_tsv(tsv, width, height):
    """Keep the Tesseract block/paragraph/line reading order and word boxes."""
    groups = {}
    for row in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
        try:
            if row['level'] != '5' or not (text := (row['text'] or '').strip()):
                continue
            key = tuple(int(row[field]) for field in ('page_num','block_num','par_num','line_num'))
            x,y,w,h = (int(row[field]) for field in ('left','top','width','height'))
            if x < 0 or y < 0 or w <= 0 or h <= 0 or x+w > width or y+h > height:
                continue
            score = float(row['conf'])
        except (ValueError, TypeError, KeyError):
            continue
        score = round(score, 1) if 0 <= score <= 100 else None
        groups.setdefault(key, []).append(dict(text=text, box=box(x,y,w,h), confidence=score))
    lines=[]
    for key,words in groups.items():
        rects=[word['box'] for word in words]
        x=min(b['x'] for b in rects)
        y=min(b['y'] for b in rects)
        r=max(b['x']+b['width'] for b in rects)
        d=max(b['y']+b['height'] for b in rects)
        values=[word['confidence'] for word in words if word['confidence'] is not None]
        lines.append(dict(id='-'.join(map(str,key)),text=' '.join(word['text'] for word in words),
                          box=box(x,y,r-x,d-y),confidence=round(sum(values)/len(values),1) if values else None,
                          words=words))
    return lines

def draft_ocr(data, mime):
    if not data or len(data)>MAX_BYTES:
        raise Rejected(413, 'Use a nonempty image no larger than 4 MB.')
    ext, w, h = image_info(data, mime)
    binary = shutil.which('tesseract')
    if binary is None:
        raise Rejected(503, 'The local Tesseract OCR engine is not available.')
    if not RUNNERS.acquire(blocking=False):
        raise Rejected(503, 'Local OCR is busy. Try again in a moment.')
    try:
        with tempfile.TemporaryDirectory(prefix='ywhy-ocr-') as folder:
            fp=Path(folder)/('image'+ext)
            fp.write_bytes(data)
            cmd=[binary,str(fp),'stdout','-l','eng','--psm','3','tsv']
            try:
                result=subprocess.run(cmd,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                                      stderr=subprocess.DEVNULL,check=False,timeout=OCR_TIMEOUT,
                                      env={**os.environ,'OMP_THREAD_LIMIT':'1'}, cwd=folder)
            except subprocess.TimeoutExpired:
                raise Rejected(504, 'Local OCR timed out. Try a smaller or clearer crop.') from None
            except OSError:
                raise Rejected(503, 'The local OCR engine could not start.') from None
            if result.returncode:
                raise Rejected(422, 'The local OCR engine could not decode this image.')
            lines = parse_tsv(result.stdout.decode('utf-8', errors='replace'), w,h)
    finally:
        RUNNERS.release()
    warnings=list(DISCLAIMERS)
    if not lines:
        warnings.append("No text was recognized. Try a clearer, upright image, or type the steps.")
    return {'engine':'tesseract','status':'draft','image':{'width':w,'height':h},'lines':lines,'warnings':warnings}

def static_file(raw):
    path = unquote(urlsplit(raw).path, errors='strict')
    if path in ('/','/paper_lab/','/paper_lab'):
        path='/paper_lab/index.html'
    parts=path.split('/')
    if len(parts)==4 and parts[:3]==['','paper_lab','math_ocr_probe'] and parts[3] in FORMULA_MODULES:
        base=HERE/'math_ocr_probe'
        p=base/parts[3]
        return p if p.is_file() and not p.is_symlink() and p.resolve().parent==base.resolve() else None
    if len(parts)!=3 or parts[0]!='':
        return None
    _,head,name=parts
    if not NAME.fullmatch(name) or name.startswith('.') or Path(name).suffix not in MIMES:
        return None
    if head=='paper_lab' and name in LAB:
        base=HERE
    elif head=='prototype' and name in PROTOTYPE:
        base=ROOT/'prototype'
    else:
        return None
    p=base/name
    return p if p.is_file() and not p.is_symlink() and p.resolve().parent==base.resolve() else None

class Handler(BaseHTTPRequestHandler):
    timeout = OCR_TIMEOUT + 3
    server_version = 'YWhyPaperLab'
    def log_message(self, *_):
        pass  # Do not persist filenames, user input, or paths.
    def result(self, status, mime, data, head=False):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cache-Control','no-store')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.end_headers()
        if not head:
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass
    def as_json(self, status, obj):
        self.result(status,MIMES['.json'],json.dumps(obj,ensure_ascii=False).encode('utf-8'))
    def local_request(self):
        host=self.headers.get('Host','').lower()
        allowed={'127.0.0.1','localhost'}
        port=self.server.server_port
        allowed |= {name+':'+str(port) for name in list(allowed)}
        return host in allowed
    def serve(self, head=False):
        if not self.local_request():
            return self.result(403,'text/plain; charset=utf-8',b'Loopback only',head)
        if urlsplit(self.path).path in ('/','/paper_lab'):
            self.send_response(302)
            self.send_header('Location','/paper_lab/')
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        try: p=static_file(self.path)
        except (ValueError, OSError): p=None
        if p is None:
            return self.result(404,'text/plain; charset=utf-8',b'Not found',head)
        try: data=p.read_bytes()
        except OSError:
            return self.result(404,'text/plain; charset=utf-8',b'Not found',head)
        return self.result(200,MIMES[p.suffix],data,head)
    def do_GET(self): self.serve()
    def do_HEAD(self): self.serve(True)
    def do_POST(self):
        try:
            if self.path not in ('/api/ocr', '/api/formula-draft'):
                raise Rejected(404,'Not found.')
            if not self.local_request():
                raise Rejected(403,'Loopback requests only.')
            origin=self.headers.get('Origin')
            dest=self.headers['Host'].lower()
            site=self.headers.get('Sec-Fetch-Site')
            if (origin and origin != 'http://'+dest) or site in ('cross-site','same-site'):
                raise Rejected(403,'Cross-origin requests are not accepted.')
            if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding','identity').lower() != 'identity':
                raise Rejected(400,'Expected an unencoded raw image body.')
            sizes=self.headers.get_all('Content-Length',[])
            if len(sizes)!=1 or not re.fullmatch('[0-9]{1,12}',sizes[0]):
                raise Rejected(411,'A valid Content-Length is required.')
            n=int(sizes[0])
            if not 0<n<=MAX_BYTES:
                raise Rejected(413,'Use a nonempty image no larger than 4 MB.')
            mime=self.headers.get_content_type()
            if mime not in ('image/png','image/jpeg'):
                raise Rejected(415,'Send a raw PNG or JPEG image.')
            data=self.rfile.read(n)
            if len(data)!=n:
                raise Rejected(400,'Image upload was incomplete.')
            if self.path == '/api/ocr':
                payload=draft_ocr(data,mime)
            else:
                image_info(data,mime)
                worker = getattr(self.server, 'formula_worker', None)
                if worker is None:
                    raise Rejected(503, 'Local formula OCR is not configured.')
                payload=worker.recognize(data)
        except (TimeoutError, socket.timeout):
            return self.as_json(408,{'status':'error','error':'Image upload timed out.'})
        except (Rejected, WorkerError) as e:
            return self.as_json(e.code,{'status':'error','error':str(e)})
        return self.as_json(200,payload)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--port',type=int,default=8765)
    ap.add_argument('--formula-python', type=Path, help='Python executable in the local GLM environment')
    ap.add_argument('--formula-model', type=Path, help='Local pinned GLM model directory')
    args=ap.parse_args()
    if bool(args.formula_python) != bool(args.formula_model):
        ap.error('--formula-python and --formula-model must be supplied together')
    worker = None
    if args.formula_python:
        # Keep the venv executable path (resolving its symlink loses the venv).
        worker = FormulaWorker((args.formula_python.absolute(),
                                HERE / 'formula_worker.py', args.formula_model.resolve(strict=True)))
    with ThreadingHTTPServer(('127.0.0.1',args.port),Handler) as server:
        print(f'Y? Paper Lab: http://127.0.0.1:{server.server_port}/paper_lab/',flush=True)
        server.formula_worker = worker
        try:
            server.serve_forever()
        finally:
            if worker:
                worker.close()

if __name__=='__main__':
    main()
