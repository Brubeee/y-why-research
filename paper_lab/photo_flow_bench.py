"""Exercise real loopback OCR on three fixed synthetic practice pages."""
import io
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import threading

from ocr_fixtures import PAGES, render
from ocr_server import Handler

IDS = ("t-invalid", "linear-photo-like", "fraction-rotated")
JS = Path(__file__).with_name("photo_flow_bench.mjs")


def bench():
    packets = []
    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            for id_ in IDS:
                page = next(p for p in PAGES if p.id == id_)
                raster, labels = render(page)
                buf = io.BytesIO()
                fmt, mime = ("JPEG", "image/jpeg") if page.jpeg else ("PNG", "image/png")
                raster.save(buf, fmt, **({"quality":72,"subsampling":2} if page.jpeg else {}))
                data = buf.getvalue()
                http = HTTPConnection("127.0.0.1", server.server_port, timeout=20)
                try:
                    http.request("POST", "/api/ocr", data, {"Content-Type": mime})
                    response = http.getresponse()
                    payload = json.loads(response.read())
                    if response.status != 200 or payload.get("status") != "draft":
                        raise RuntimeError(f"{id_}: actual HTTP OCR failed ({response.status})")
                finally:
                    http.close()
                packets.append({"id":id_, "mime":mime, "ocr":payload, "labels":labels})
        finally:
            server.shutdown()
            worker.join()
    proc = subprocess.run(["node", str(JS)], input=json.dumps(packets),
                          encoding="utf-8", capture_output=True, check=True, timeout=15)
    return json.loads(proc.stdout)


if __name__ == "__main__":
    print(json.dumps(bench(), indent=2, ensure_ascii=False))
