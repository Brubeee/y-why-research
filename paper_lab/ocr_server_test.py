#!/usr/bin/env python3
"""Use only synthetic raster pages. Run: python paper_lab/ocr_server_test.py"""
import io
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
import threading
from pathlib import Path
import re
import shutil
import struct
import subprocess
from urllib.parse import urljoin
from unittest import TestCase, main as unit_main, mock
from PIL import Image, ImageDraw, ImageFont
from ocr_server import MAX_BYTES, PNG, Handler, Rejected, draft_ocr, image_info, static_file

def printed_page(fmt='PNG'):
    im=Image.new('RGB',(1300,930),'white')
    draw=ImageDraw.Draw(im)
    font=ImageFont.truetype('DejaVuSansMono.ttf',44)
    for i,line in enumerate(('Math practice', '2 + 3 = 5', '4 + 3 = 7', '8 + 1 = 9')):
        draw.text((110,135+85*i),line,fill='black',font=font)
    out=io.BytesIO()
    im.save(out,fmt)
    return out.getvalue()

class OCRTest(TestCase):
    def test_real_ocr_png_and_jpeg(self):
        if not shutil.which('tesseract'):
            self.skipTest('local Tesseract not installed')
        for fmt,mime in [('PNG','image/png'),('JPEG','image/jpeg')]:
            with self.subTest(fmt=fmt):
                report=draft_ocr(printed_page(fmt),mime)
                self.assertEqual(report['status'],'draft')
                self.assertEqual(report['image'],{'width':1300,'height':930})
                lines=report['lines']
                self.assertEqual(len(lines),4)
                self.assertEqual(lines[0]['text'],'Math practice')
                # OCR is a draft; it may remove spaces or distort individual digits.
                for line,start,end in zip(lines[1:],('2','4','8'),('=5','=7','=9')):
                    compact=line['text'].replace(' ','')
                    self.assertTrue(compact.startswith(start),line)
                    self.assertTrue(compact.endswith(end),line)
                    self.assertIn('+',compact)
                ys=[l['box']['y'] for l in lines]
                self.assertEqual(ys,sorted(ys))
                for line in lines:
                    self.assertGreater(line['box']['height'],0)
                    self.assertGreater(line['confidence'],0)
                    self.assertTrue(line['words'])
                self.assertTrue(any('Handwriting' in s for s in report['warnings']))

    def test_magic_and_limits(self):
        cases=[(b'%PDF this is not PNG','image/png',415),
               (printed_page('JPEG'),'image/png',415),
               (printed_page(),'image/jpeg',415),
               (printed_page(),'image/webp',415),
               (PNG+b'\x00\x00\x00\x0dIHDR'+struct.pack('>II',5000,5000)+bytes(12),'image/png',413)]
        for data,mime,code in cases:
            with self.subTest(mime=mime,code=code):
                with self.assertRaises(Rejected) as thrown:image_info(data,mime)
                self.assertEqual(thrown.exception.code,code)
        for data in (b'',bytes(MAX_BYTES+1)):
            with self.assertRaises(Rejected) as thrown:draft_ocr(data,'image/png')
            self.assertEqual(thrown.exception.code,413)

    def test_temporary_file_removed_on_timeout(self):
        paths=[]
        def time_out(args,**kw):
            paths.append(Path(args[1]))
            self.assertTrue(paths[-1].exists())
            raise subprocess.TimeoutExpired(args,kw['timeout'])
        with mock.patch('ocr_server.shutil.which',return_value='/usr/bin/tesseract'):
            with mock.patch('ocr_server.subprocess.run',side_effect=time_out):
                with self.assertRaises(Rejected) as caught:draft_ocr(printed_page(),'image/png')
        self.assertEqual(caught.exception.code,504)
        self.assertEqual(len(paths),1)
        self.assertFalse(paths[0].parent.exists())

    def test_local_http_ocr_and_host_validation(self):
        if not shutil.which('tesseract'):
            self.skipTest('local Tesseract not installed')
        try:
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        except PermissionError:
            self.skipTest('Loopback binding is prohibited in this environment')
        with server:
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def req(method,path,expect,body=None,headers=None):
                    with_response = HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                    try:
                        with_response.request(method,path,body,headers or {})
                        rsp=with_response.getresponse()
                        self.assertEqual(rsp.status,expect)
                        return rsp,rsp.read()
                    finally:
                        with_response.close()
                req('GET','/paper_lab/%2e%2e/README.md',404)
                rsp,_=req('GET','/',302)
                self.assertEqual(rsp.getheader('Location'),'/paper_lab/')
                req('GET','/paper_lab/',403,headers={'Host':'outside.invalid'})
                headers={'Content-Type':'image/png'}
                raw=printed_page()
                _,out=req('POST','/api/ocr',413,b'',{**headers,'Content-Length':str(MAX_BYTES+1)})
                self.assertIn('4 MB',json.loads(out)['error'])
                req('POST','/api/ocr',403,raw,{**headers,'Origin':'https://outside.invalid'})
                req('POST','/api/ocr',415,b'not PNG bytes',headers)
                _,out=req('POST','/api/ocr',200,raw,headers)
                self.assertEqual(len(json.loads(out)['lines']),4)
            finally:
                server.shutdown()
                thread.join(timeout=5)

    def test_local_page_and_static_module_graph(self):
        # Load over HTTP, not from the filesystem like the DOM harness.
        try:
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        except PermissionError:
            self.skipTest('Loopback binding is prohibited in this environment')
        with server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                def get(path, status=200, mime=None):
                    with_response = HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    try:
                        with_response.request('GET', path)
                        response = with_response.getresponse()
                        self.assertEqual(response.status, status, path)
                        if mime:
                            self.assertEqual(response.headers.get_content_type(), mime, path)
                        return response.read().decode('utf-8')
                    finally:
                        with_response.close()

                start = '/paper_lab/'
                page = get(start, mime='text/html')
                script = re.search(r'<script\s+type="module"\s+src="([^"]+)"', page)
                self.assertIsNotNone(script, 'Paper Lab should load a module entry point')
                stylesheet = re.search(r'<link\s+rel="stylesheet"\s+href="([^"]+)"', page)
                self.assertIsNotNone(stylesheet)
                get(urljoin(start, stylesheet[1]), mime='text/css')
                stack = [urljoin(start, script[1])]
                seen = set()
                # Paper Lab uses single-line static imports/re-exports. This is
                # an asset-routing test, not a general JS parser or browser test.
                import_path = re.compile(
                    r"""^\s*(?:import\s+(?:[^;\n]*?\bfrom\s+)?|export\s+[^;\n]*?\bfrom\s+)['"](\./[^'"]+)['"]""",
                    re.MULTILINE,
                )
                while stack:
                    path = stack.pop()
                    if path in seen:
                        continue
                    seen.add(path)
                    source = get(path, mime='text/javascript')
                    stack.extend(urljoin(path, item) for item in import_path.findall(source))

                for name in ('curriculum.mjs', 'operation_claim.mjs'):
                    self.assertIn(urljoin(start, name), seen)
                get('/paper_lab/photo_flow_bench.mjs', status=404)
                get('/paper_lab/ocr_server.py', status=404)
            finally:
                server.shutdown()
                thread.join(timeout=5)

    def test_static_allowlist(self):
        for target in ('/.git/config','/paper_lab/ocr_server.py','/paper_lab/..%2f.git%2fconfig',
                       '/paper_lab/%2e%2e/README.md','/prototype/README.md','/prototype/',
                       '/prototype/typed-equations.js/','/paper_lab/verify.test.mjs'):
            self.assertIsNone(static_file(target),target)
        self.assertEqual(static_file('/prototype/typed-equations.js?x=2').name,'typed-equations.js')

if __name__=='__main__':unit_main()
