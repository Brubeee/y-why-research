"""Freeze the synthetic JPEG coordinate counterexample and current OCR behavior."""
from io import BytesIO
import shutil
import unittest
from PIL import Image, ImageOps
from exif_probe import EXPECTED_CORNERS, ORIENTATIONS, WIDTH, HEIGHT, fixture, report, sample
from ocr_server import image_info

class ExifProbeTest(unittest.TestCase):
    def test_metadata_only_same_size_not_same_coordinates(self):
        baseline=None
        for o in ORIENTATIONS:
            with self.subTest(orientation=o):
                data=fixture(o)
                self.assertEqual(image_info(data,'image/jpeg'),('.jpg',WIDTH,HEIGHT))
                with Image.open(BytesIO(data)) as raw:
                    self.assertEqual(raw.getexif()[274],o)
                    pixels=raw.tobytes()
                    if baseline is None:
                        baseline=pixels
                    self.assertEqual(pixels,baseline)
                    self.assertEqual(sample(raw),EXPECTED_CORNERS[1])
                    shown=ImageOps.exif_transpose(raw)
                    self.assertEqual(shown.size,(HEIGHT,WIDTH) if o==6 else (WIDTH,HEIGHT))
                    self.assertEqual(sample(shown),EXPECTED_CORNERS[o])

    @unittest.skipUnless(shutil.which('tesseract'), 'Needs local OCR binary')
    def test_real_ocr_response_reports_encoded_geometry(self):
        outputs=report()
        lines=outputs[0]['ocr']
        self.assertGreaterEqual(len(lines),2,'Probe must elicit actual nonempty boxes; blank equality is uninformative.')
        self.assertTrue(all(row['box']['width']>0 and row['box']['height']>0 for row in lines))
        for row in outputs:
            with self.subTest(orientation=row['orientation']):
                self.assertEqual(row['server_encoded_size'],(WIDTH,HEIGHT))
                self.assertEqual(row['ocr'],lines,'OCR orientation behavior changed; investigate contract before trusting JPEG geometry.')
