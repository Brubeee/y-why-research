import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw

from phone_captures import fetch_capture, freeze, normalize, pixels, prepare, validate_rows, write_json


class PrivateCaptureTests(unittest.TestCase):
    def test_all_orientations_with_asymmetric_patch(self):
        expected = [(1,0,4,2),(3,0,6,2),(3,3,6,5),(1,3,4,5),
                    (0,1,2,4),(3,1,5,4),(3,3,5,6),(0,3,2,6)]
        with TemporaryDirectory() as tmp:
            src = Path(tmp)/'tagged.png'
            for n, box in enumerate(expected, 1):
                with self.subTest(tag=n):
                    im = Image.new('RGB',(7,5))
                    im.paste((127,20,253),(1,0,4,2))
                    im.getexif()[274] = n
                    im.save(src, exif=im.getexif())
                    upright, info = fetch_capture(src)
                    want = Image.new('RGB',(7,5) if n <= 4 else (5,7))
                    want.paste((127,20,253),box)
                    self.assertEqual(info['exif_orientation'],n)
                    self.assertEqual(pixels(want),info['raster_sha256'])
                    self.assertEqual(upright.tobytes(),want.tobytes())
                    self.assertNotIn(274,upright.getexif())

    def test_input_cap_is_not_an_ocr_failure(self):
        with TemporaryDirectory() as tmp:
            src = Path(tmp)/'large.jpg'
            for size, outcome in [((4032,3024),'reject-413-dimensions-or-header'),
                                  ((4000,3000),'within-dimension-cap')]:
                Image.new('RGB',size,'white').save(src)
                upright, info = fetch_capture(src)
                self.assertEqual(info['server_header_preflight'],outcome)
                self.assertEqual(info['browser_byte_preflight'],'within-cap')
                self.assertEqual(upright.size,(1600,1200))

    def test_bad_formats_and_order(self):
        with TemporaryDirectory() as tmp:
            src = Path(tmp)/'bad'
            Image.new('RGB',(7,5)).save(src, format='GIF')
            with self.assertRaisesRegex(ValueError,'research-format'):
                fetch_capture(src)
            src.write_bytes(b'not a jpg')
            with self.assertRaisesRegex(ValueError,'research-decode'):
                fetch_capture(src)
        for boxes in [[[1,2,6,4],[1,1,4,2]], [[1,2,6,4],[1,3,4,5]], [[1,2,11,4]]]:
            with self.assertRaisesRegex(ValueError,'out of physical order'):
                validate_rows([{'box':b,'literal':'x=3'} for b in boxes],(10,10))

    def test_private_freeze_and_crops_match_one_raster(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            src, bundle, ref, out = (root/p for p in ('source.png','bundle','ref.json','crops'))
            im = Image.new('RGB',(360,180),'white')
            for x,y in [(20,30),(50,30),(100,90),(140,90)]:
                ImageDraw.Draw(im).rectangle((x,y,x+7,y+13),fill='black')
            im.save(src)
            normalize(src,bundle)
            ref_rows = [{'box':[20,30,58,44],'literal':'2x+6=14'},
                        {'box':[100,90,148,104],'literal':'2x=9'}]
            write_json(ref,{'raster_sha256':'0'*64,'rows':ref_rows})
            with self.assertRaisesRegex(ValueError,'different upright raster'):
                freeze(bundle,ref)
            write_json(ref,{'raster_sha256':pixels(im),'rows':ref_rows})
            freeze(bundle,ref)
            with self.assertRaises(FileExistsError):
                freeze(bundle,ref)
            prepare(bundle,out)
            manifest = json.loads((out/'manifest.json').read_text())[0]['crops']
            self.assertEqual([r['arm'] for r in manifest],
                             ['oracle']*2+['detector']*2+['rule_mask_detector']*2)
            for crop in manifest:
                with Image.open(out/crop['name']) as actual:
                    self.assertEqual(pixels(actual),pixels(im.crop(crop['padded'])))
            im.putpixel((0,0),(1,2,3))
            im.save(bundle/'upright.png')
            with self.assertRaisesRegex(ValueError,'differs from frozen reference'):
                prepare(bundle,root/'must-not-exist')
            self.assertFalse((root/'must-not-exist').exists())
