"""Predeclared synthetic holds: four new chains, paired clean and adverse pages."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter

from page_prepare import W, H, bounds, coverage, paint_row

CASES = (
    ('leading-minus', (
        ('-3(k+2)=21', ('−3(k+2)=21',)),
        ('-3k-6=21', ('−3k−6=21',)),
        ('k=-8', ('k=−8',)),
    ), 20, -39),
    ('stacked-close', (
        (r'\frac{2n}{5}+3=9', (('2n', '5'), '+3=9')),
        (r'\frac{2n}{5}=5', (('2n', '5'), '=5')),
        ('n=15', ('n=15',)),
    ), 13, 106),
    ('offset-rows', (
        ('7q-8=20', ('7q−8=20',)),
        ('7q=28', ('7q=28',)),
        ('q=5', ('q=5',)),
    ), 10, 190),
    ('short-last-fraction', (
        (r'\frac{w}{4}-1=2', (('w', '4'), '−1=2')),
        (r'\frac{w}{4}=3', (('w', '4'), '=3')),
        ('w=12', ('w=12',)),
    ), 28, -52),
)
COHORTS = ('clean-printed', 'phone-style-render')


def source(data, gap, shift, adverse, index):
    first = paint_row(data[0][1], 91, adverse)
    second = paint_row(data[1][1], 204, adverse)
    last = paint_row(data[2][1], 346, adverse)
    masks = []
    for i, (m, dx, dy) in enumerate(zip(
        (first, second, last),
        (shift, shift + (46 if index == 2 else 7), shift + 13),
        (0, first.getbbox()[3] + gap - second.getbbox()[1], 0),
        strict=True,
    )):
        placed = Image.new('L', (W, H))
        placed.paste(m, (dx, dy))
        masks.append(placed)
    assert masks[1].getbbox()[1] - masks[0].getbbox()[3] == gap
    im = Image.new('L', (W, H), 255)
    if adverse:
        draw = ImageDraw.Draw(im)
        for y in range(H):
            draw.line((0, y, W, y), fill=245 - y // 26)
        # Scored stressors, not representations of measured phone capture:
        # sloped long rules through glyphs, a broken dark rule, and a soft graphite-like mark.
        for y in range(20 + 4 * index, H, 42):
            draw.line((18, y, W-18, y+12), fill=157 + 5 * index, width=2)
        for x in range(32, W-50, 61):
            draw.line((x, 316, x+38, 316), fill=165, width=2)
        smear_x = 572 if index != 2 else 64
        draw.ellipse((smear_x-11, 80, smear_x+12, 87), fill=200)
        draw.ellipse((smear_x-7, 328, smear_x+7, 334), fill=193)
    for m in masks:
        im.paste(36, (0, 0, W, H), m)
    f = BytesIO()
    if adverse:
        im.filter(ImageFilter.GaussianBlur(.6)).save(f, 'JPEG', quality=73)
    else:
        im.save(f, 'PNG')
    return f.getvalue(), masks


def fixtures():
    for index, (case, data, gap, shift) in enumerate(CASES):
        for adverse, cohort in enumerate(COHORTS):
            key = f'{case}--{cohort}'
            raw, masks = source(data, gap, shift, bool(adverse), index)
            yield key, cohort, case, [s for s, _ in data], raw, masks, gap


def freeze(folder):
    folder.mkdir(parents=True, exist_ok=True)
    keys = {}
    for key, cohort, case, truth, raw, masks, gap in fixtures():
        (folder / key).write_bytes(raw)
        keys[key] = dict(photo_sha256=sha256(raw).hexdigest(), truth=truth,
                         gap=gap, truth_boxes=[list(m.getbbox()) for m in masks])
    return keys


if __name__ == '__main__':
    print(json.dumps(freeze(Path(sys.argv[1])), indent=2))
