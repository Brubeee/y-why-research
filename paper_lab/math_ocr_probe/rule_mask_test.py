import unittest

import numpy as np
from PIL import Image, ImageDraw

from page_geometry import proposals
from rule_mask import striped_proposals


class RuleMaskTests(unittest.TestCase):
    def test_wide_sloped_rule_only_does_not_create_equations(self):
        photo = Image.new('L',(640,365),246)
        draw = ImageDraw.Draw(photo)
        draw.line((14,95,620,78),fill=130,width=2)
        draw.line((14,175,620,159),fill=143,width=2)
        before = photo.tobytes()
        self.assertTrue(proposals(photo))
        self.assertEqual(proposals(photo,suppress_ruling=True),[])
        self.assertEqual(photo.tobytes(),before)

    def test_short_literal_strokes_are_not_rules(self):
        mask = np.zeros((365,640),dtype=bool)
        mask[50:52,38:62] = True
        mask[99:101,250:297] = True
        mask[74:92,268:278] = True
        mask[106:128,267:278] = True
        self.assertTrue(np.array_equal(striped_proposals(mask),mask))

    def test_rule_crosses_glyph_but_vertical_core_survives(self):
        mask = np.zeros((365,640),dtype=bool)
        mask[90:92,10:620] = True
        mask[77:103,115:120] = True
        result = striped_proposals(mask)
        self.assertEqual(np.count_nonzero(result[:,115:120]),26*5)
        self.assertFalse(result[90:92,350:352].any())
        self.assertTrue(mask[90:92,350:352].all())


if __name__ == '__main__':
    unittest.main()
