"""Predeclared synthetic holds: four new chains, paired clean and adverse pages."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter

from page_prepare import W, H, bounds, coverage, paint_row

CASES = (
    ('faint-leading', (
        ('-2(3a-1)=20', ('−2(3a−1)=20',)),
        ('-6a+2=20', ('−6a+2=20',)),
        ('a=-4', ('a=−4',)),
    ), 19, -34),
    ('stacked-offset', (
        (r'\frac{3r}{8}+4=7', (('3r', '8'), '+4=7')),
        (r'\frac{3r}{8}=3', (('3r', '8'), '=3')),
        ('r=9', ('r=9',)),
    ), 16, 103),
    ('short-drift', (
        ('4z-7=13', ('4z−7=13',)),
        ('4z=20', ('4z=20',)),
        ('z=6', ('z=6',)),
    ), 12, 176),
    ('isolated-short-bar', (
        (r'\frac{p}{6}-1=5', (('p', '6'), '−1=5')),
        (r'\frac{p}{6}=6', (('p', '6'), '=6')),
        ('p=38', ('p=38',)),
    ), 30, -50),
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
            draw.line((18, y, W-18, y+(-17,19,10,-11)[index]), fill=156 + 4 * index, width=2)
        for x in range(32, W-50, 61):
            draw.line((x, 306, x+43, 306), fill=165, width=2)
        smear_x = 572 if index != 2 else 64
        draw.ellipse((smear_x-11, 80, smear_x+12, 87), fill=200)
        draw.ellipse((smear_x-7, 328, smear_x+7, 334), fill=193)
    for row, m in enumerate(masks):
        shade = 135 if adverse and index == 0 and row < 2 else (102 if adverse and row == 2 else 35)
        im.paste(shade, (0, 0, W, H), m)
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
