"""Single-job, local-only GLM worker transport. No user image is written to disk."""
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import threading
import time

MAX_INPUT = 4_000_000
FORMULA_MAX_PIXELS = 12_500_000  # Include nominal 12 MP captures such as 4032 x 3024.
FORMULA_MAX_SIDE = 7000
MAX_REPLY = 50_000  # Maximum framed JSON including Unicode escapes.
MAX_RAW = 8192
MODE = 'glm-ocr/formula-recognition'
READY = b'{"ready":true}'


class WorkerError(Exception):
    def __init__(self, code, message, *, reason=None):
        super().__init__(message)
        self.code = code
        self.reason = reason


def _read(sock, n, deadline=None):
    out = bytearray()
    while len(out) < n:
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError
            sock.settimeout(remaining)
        chunk = sock.recv(n - len(out))
        if not chunk:
            raise EOFError
        out.extend(chunk)
    return bytes(out)


def _frame(sock, max_size, deadline=None):
    n, = struct.unpack('!I', _read(sock, 4, deadline))
    if not 0 < n <= max_size:
        raise ValueError('Invalid frame length.')
    return _read(sock, n, deadline)


def _write(sock, data, deadline=None):
    if deadline is not None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        sock.settimeout(remaining)  # sendall applies the timeout to the whole send.
    sock.sendall(struct.pack('!I', len(data)))
    if deadline is not None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        sock.settimeout(remaining)
    sock.sendall(data)


class FormulaWorker:
    """Own one preloaded subprocess. Busy requests are not queued."""
    def __init__(self, argv, *, startup_timeout=120, request_timeout=60):
        self.argv = tuple(argv)
        self.startup_timeout = startup_timeout
        self.request_timeout = request_timeout
        self.lock = threading.Lock()
        self.proc = None
        self.sock = None
        self.closed = False

    def _stop(self):
        if self.sock is not None:
            self.sock.close()
            self.sock = None
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()
            self.proc = None

    def _start(self):
        deadline = time.monotonic() + self.startup_timeout
        self.sock, child = socket.socketpair()
        with child:
            self.proc = subprocess.Popen(
                [*self.argv, str(child.fileno())], pass_fds=(child.fileno(),),
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env={**os.environ, 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'})
        if _frame(self.sock, MAX_REPLY, deadline) != READY:
            raise ValueError('Worker failed startup.')

    def close(self):
        with self.lock:
            self.closed = True
            self._stop()

    def recognize(self, data):
        if not 0 < len(data) <= MAX_INPUT:
            raise WorkerError(413, 'Use a nonempty image no larger than 4 MB.')
        if not self.lock.acquire(blocking=False):
            raise WorkerError(503, 'Formula OCR is busy. Try again in a moment.', reason='formula_busy')
        try:
            if self.closed:
                raise WorkerError(503, 'Local formula OCR is not available.')
            try:
                if self.proc is None or self.proc.poll() is not None:
                    self._stop()
                    self._start()
            except (OSError, EOFError, ValueError):
                self._stop()
                raise WorkerError(503, 'Local formula OCR could not start.') from None
            try:
                deadline = time.monotonic() + self.request_timeout
                _write(self.sock, data, deadline)
                reply = json.loads(_frame(self.sock, MAX_REPLY, deadline))
                if reply == {'error': 'image'}:
                    raise WorkerError(422, 'Local formula OCR could not decode this image.')
                if (not isinstance(reply, dict) or set(reply) != {'raw', 'limitHit'}
                        or type(reply['limitHit']) is not bool or not isinstance(reply['raw'], str)
                        or len(reply['raw']) > MAX_RAW):
                    raise ValueError('Invalid worker response.')
                # Reject malformed Unicode before it reaches the HTTP writer.
                reply['raw'].encode('utf-8', errors='strict')
            except TimeoutError:
                self._stop()
                raise WorkerError(504, 'Local formula OCR timed out. Retake or retry.') from None
            except (OSError, EOFError, ValueError, RecursionError):
                self._stop()
                raise WorkerError(503, 'Local formula OCR stopped unexpectedly. Try again.') from None
            if reply['limitHit'] or not reply['raw'].strip():
                raise WorkerError(422, 'No complete transcription was produced. Retake or retry.')
            return {'engine': 'glm-ocr', 'status': 'unconfirmed', 'mode': MODE,
                    'reviewRequired': True, **reply}
        finally:
            self.lock.release()


def _serve(model_path, fd):
    # Set before importing either Hugging Face package; never run remote code.
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import io
    from PIL import Image, ImageOps, UnidentifiedImageError
    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor

    model_path = Path(model_path).resolve(strict=True)
    if not model_path.is_dir():
        raise ValueError('Expected a locally provisioned model directory.')
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    kwargs = dict(local_files_only=True, trust_remote_code=False)
    model = AutoModelForImageTextToText.from_pretrained(str(model_path), dtype=torch.bfloat16, **kwargs)
    processor = AutoProcessor.from_pretrained(str(model_path), **kwargs)
    model.eval()
    with socket.socket(fileno=fd) as sock, torch.inference_mode():
        _write(sock, READY)

        def recognize_image(data):
            try:
                with Image.open(io.BytesIO(data), formats=('JPEG', 'PNG')) as source:
                    if (max(source.size) > FORMULA_MAX_SIDE
                            or source.width * source.height > FORMULA_MAX_PIXELS
                            or getattr(source, 'n_frames', 1) != 1):
                        raise ValueError
                    image = ImageOps.exif_transpose(source).convert('RGB')
                    image.thumbnail((768, 768), Image.Resampling.LANCZOS)
            except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
                return {'error': 'image'}
            messages = [{'role': 'user', 'content': [{'type': 'image', 'image': image},
                         {'type': 'text', 'text': 'Formula Recognition:'}]}]
            inputs = processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                                   return_dict=True, return_tensors='pt')
            cap = 128
            output = model.generate(**inputs, do_sample=False, max_new_tokens=cap)
            new = output[0][inputs['input_ids'].shape[-1]:]
            return {'raw': processor.decode(new, skip_special_tokens=True), 'limitHit': len(new) >= cap}

        while True:
            try:
                data = _frame(sock, MAX_INPUT)
            except EOFError:
                break
            reply = recognize_image(data)
            del data
            _write(sock, json.dumps(reply).encode())
            del reply


if __name__ == '__main__':
    _serve(sys.argv[1], int(sys.argv[2]))
