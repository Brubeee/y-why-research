"""Small functional controls for the frozen geometry-first prototype."""
import unittest
from PIL import Image, ImageDraw
from page_geometry import proposals


class PageGeometryTests(unittest.TestCase):
    def canvas(self):
        im=Image.new('L',(640,365),255)
        return im,ImageDraw.Draw(im)

    def test_empty_and_alone_rule(self):
        im,d=self.canvas()
        d.line((20,41,610,41),fill=100)
        self.assertEqual(proposals(im),[])

    def test_fraction_bar_links_two_isolated_fragments(self):
        im,d=self.canvas()
        d.rectangle((110,35,120,49),fill=20)
        d.rectangle((100,54,129,55),fill=20)
        d.rectangle((110,59,120,72),fill=20)
        self.assertEqual([box for box,_ in proposals(im)],[(100,35,130,73)])

    def test_separate_rows_not_touched_by_padding(self):
        im,d=self.canvas()
        for y in (35,61,332):
            d.rectangle((110,y,124,y+16),fill=20)
        out=proposals(im)
        self.assertEqual(len(out),3)
        for (_, padded), (next_box, next_pad) in zip(out,out[1:]):
            self.assertLessEqual(padded[3],next_pad[1])
            self.assertLessEqual(padded[3],next_box[1])

    def test_equals_is_not_a_fraction_bar_between_rows(self):
        im,d=self.canvas()
        for y in (20,52,63):
            d.rectangle((101,y,118,y+(16 if y!=52 else 18)),fill=20)
        # The paired bars sit in the intervening space, with close parallel overlap.
        d.line((99,42,120,42),fill=20)
        d.line((99,47,120,47),fill=20)
        self.assertFalse(any(b[1]<=20 and b[3]>=69 for b,_ in proposals(im)))


if __name__=='__main__':
    unittest.main()
