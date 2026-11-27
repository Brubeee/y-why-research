"""Process/HTTP regressions without downloading a model or using student data."""
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import socket
import threading
import unittest
from unittest import mock

import formula_worker

from formula_worker import FormulaWorker, WorkerError
from ocr_server import Handler, MAX_BYTES
from ocr_server_test import printed_page

FAKE = r'''
import json, os, socket, sys, time
sys.path.insert(0, sys.argv[1])
from formula_worker import MAX_INPUT, READY, _frame, _write
sock = socket.socket(fileno=int(sys.argv[2]))
_write(sock, READY)
while True:
    data = _frame(sock, MAX_INPUT)
    if data == b'timeout':
        time.sleep(5)
    if data == b'badframe':
        _write(sock, b'{"raw":"a","limitHit":0}')
    elif data == b'badimage':
        _write(sock, b'{"error":"image"}')
    else:
        _write(sock, json.dumps({"raw": r"$$\begin{array}{l}7x+4=53\\7x=48\\x=7\end{array}$$",
                                "limitHit": data == b'truncated'}).encode())
'''


@contextmanager
def local_http(worker=None, *, with_connection=False):
    with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
        server.formula_worker = worker
        task = threading.Thread(target=server.serve_forever, daemon=True)
        task.start()
        try:
            def connection():
                return HTTPConnection('127.0.0.1', server.server_port, timeout=5)
            def post(data, **headers):
                with_headers = {'Content-Type': 'image/png', **headers}
                conn = connection()
                try:
                    conn.request('POST', '/api/formula-draft', data, with_headers)
                    res = conn.getresponse()
                    return res.status, res.getheader('Cache-Control'), json.load(res)
                finally:
                    conn.close()
            yield (post,connection) if with_connection else post
        finally:
            server.shutdown()
            task.join(timeout=5)


class FormulaWorkerTest(unittest.TestCase):
    def setUp(self):
        self.worker = FormulaWorker((sys.executable, '-c', FAKE, str(Path(__file__).resolve().parent)),
                                    startup_timeout=5, request_timeout=.5)
        self.addCleanup(self.worker.close)

    def error_code(self, data, code):
        with self.assertRaises(WorkerError) as err:
            self.worker.recognize(data)
        self.assertEqual(err.exception.code, code)

    def test_reuses_process_but_refuses_truncation_and_bad_image(self):
        first = self.worker.recognize(b'image')
        proc = self.worker.proc
        self.assertTrue(first['reviewRequired'])
        self.assertEqual(first['status'], 'unconfirmed')
        self.assertNotIn('box', first)
        self.error_code(b'truncated', 422)
        self.error_code(b'badimage', 422)
        self.assertEqual(self.worker.recognize(b'image'), first)
        self.assertIs(self.worker.proc, proc)

    def test_timeout_kills_worker_and_next_request_starts_clean(self):
        self.worker.recognize(b'image')
        prev = self.worker.proc
        self.error_code(b'timeout', 504)
        self.assertIsNotNone(prev.poll())
        self.assertIsNone(self.worker.proc)
        self.worker.recognize(b'image')
        self.assertIsNot(self.worker.proc, prev)

    def test_invalid_reply_quarantined(self):
        self.error_code(b'badframe', 503)
        self.assertIsNone(self.worker.proc)
        self.worker.recognize(b'image')

    def test_busy_request_is_not_queued(self):
        with self.worker.lock:
            self.error_code(b'image', 503)
        self.assertIsNone(self.worker.proc)

    def test_disconnected_read_can_be_busy_but_same_retake_works_after_release(self):
        a, b = printed_page(), printed_page('JPEG')
        self.worker.request_timeout = 8
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        actual_frame, recognize = formula_worker._frame, self.worker.recognize

        def delayed_frame(sock, maximum, deadline=None):
            if maximum == formula_worker.MAX_REPLY and not entered.is_set():
                entered.set()
                if not release.wait(5):
                    raise TimeoutError('Test never released first request')
            return actual_frame(sock, maximum, deadline)

        def track_completion(data):
            try:
                return recognize(data)
            finally:
                if data == a:
                    finished.set()

        with local_http(self.worker, with_connection=True) as (post, connection), \
                mock.patch('formula_worker._frame', delayed_frame), \
                mock.patch.object(self.worker, 'recognize', side_effect=track_completion):
            first = connection()
            try:
                first.request('POST', '/api/formula-draft', a, {'Content-Type':'image/png'})
                self.assertTrue(entered.wait(5))
                first.sock.shutdown(socket.SHUT_RDWR)
                first.close()
                status, cache, result = post(b, **{'Content-Type':'image/jpeg'})
                self.assertEqual((status, cache, result['reason']), (503, 'no-store', 'formula_busy'))
                release.set()
                self.assertTrue(finished.wait(5))
                status, _, result = post(b, **{'Content-Type':'image/jpeg'})
                self.assertEqual((status, result['status']), (200, 'unconfirmed'))
            finally:
                release.set()
                first.close()

    def test_formula_accepts_standard_camera_dimensions_only_within_bounds(self):
        # Check the local HTTP size gate with genuine, small-on-disk JPEGs.
        import io
        from PIL import Image
        with local_http(self.worker) as post:
            for size, expected in [((3024, 4032), 200), ((3200, 4000), 413),
                                   ((7001, 100), 413)]:
                with self.subTest(size=size), io.BytesIO() as image:
                    Image.new('RGB', size, 'white').save(image, 'JPEG')
                    headers = {'Content-Type': 'image/jpeg'}
                    status, _, result = post(image.getvalue(), **headers)
                    self.assertEqual(status, expected)
                    if expected == 413:
                        self.assertEqual(result['reason'], 'photo_dimensions')

    def test_loopback_http_honest_outcomes(self):
        png = printed_page()
        with local_http() as post:
            status, _, offline = post(png)
            self.assertEqual(status, 503)
            self.assertNotIn('reason', offline)
        with local_http(self.worker) as post:
            self.assertEqual(post(png, Origin='https://untrusted.invalid')[0], 403)
            self.assertEqual(post(png, Host='untrusted.invalid')[0], 403)
            status, _, upload_limit = post(b'', **{'Content-Length': str(MAX_BYTES + 1)})
            self.assertEqual(status, 413)
            self.assertNotIn('reason', upload_limit)
            self.assertEqual(post(b'not PNG')[0], 415)
            self.assertIsNone(self.worker.proc)
            status, cache, draft = post(png)
            self.assertEqual((status, cache, draft['status']), (200, 'no-store', 'unconfirmed'))
            self.assertIn('7x=48', draft['raw'])
            self.assertNotIn('lines', draft)
            self.assertNotIn('verdict', draft)
            self.assertNotIn('confidence', draft)


if __name__ == '__main__':
    unittest.main()
