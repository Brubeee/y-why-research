import unittest

from PIL import Image, ImageDraw

from horizontal_trim import repair_horizontal_apertures


class ApertureTests(unittest.TestCase):
    def setUp(self):
        self.photo = Image.new('L', (640,365), 245)
        self.draw = ImageDraw.Draw(self.photo)
        self.draw.line((8,100,632,100), fill=146, width=2)
        self.wide = (((8,88,633,115),(0,80,640,124)),)

    def test_no_core_preserves_rule_only_box(self):
        self.assertEqual(repair_horizontal_apertures(self.photo,self.wide), list(self.wide))

    def test_clean_box_is_not_trimmed(self):
        narrow = [((132,88,184,115),(120,80,196,124))]
        self.assertEqual(repair_horizontal_apertures(self.photo,narrow), narrow)

    def test_short_row_keeps_leading_minus_and_lateral_margin(self):
        self.draw.line((112,96,131,96),fill=24,width=2)
        self.draw.rectangle((137,89,144,112),fill=24)
        self.draw.rectangle((153,89,161,114),fill=24)
        self.draw.rectangle((170,90,177,109),fill=24)
        before = self.photo.tobytes()
        [(box,pad)] = repair_horizontal_apertures(self.photo,self.wide)
        self.assertEqual(before,self.photo.tobytes())
        self.assertLessEqual(box[0],112)
        self.assertGreater(box[2],177)
        self.assertLess(pad[2]-pad[0],180)
        self.assertEqual(pad[1::2],(80,124))


if __name__ == '__main__':
    unittest.main()
