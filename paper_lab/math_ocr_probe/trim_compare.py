"""Run paired width repair vs unmodified geometry and oracle, without text feedback."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image
from horizontal_trim import repair_horizontal_apertures
from page_geometry import proposals
from page_prepare import bounds, coverage
from page_score import status
from trim_prepare import fixtures, COHORTS

ARMS = ('oracle', 'geometry', 'trimmed')


def build(folder):
    folder.mkdir(parents=True, exist_ok=True)
    frozen = json.loads(Path(__file__).with_name('trim-05-freeze.json').read_text())
    pages = []
    for key, cohort, chain, truth, raw, masks, gap in fixtures():
        photo_sha = sha256(raw).hexdigest()
        rects = [m.getbbox() for m in masks]
        assert frozen[key] == dict(photo_sha256=photo_sha, truth=truth, gap=gap,
                                   truth_boxes=[list(r) for r in rects])
        photo = Image.open(BytesIO(raw)).convert('L')
        geo = proposals(photo)
        arms = ([(r, bounds(r, photo.size, 12)) for r in rects],
                geo, repair_horizontal_apertures(photo, geo))
        assert all(a[1][1::2] == b[1][1::2] for a, b in zip(*arms[1:], strict=True))
        crops = []
        for arm, boxes in zip(ARMS, arms, strict=True):
            for i, (box, pad) in enumerate(boxes, 1):
                name = f'{key}--{arm}-{i}.png'
                target = folder / name
                photo.crop(pad).save(target)
                crops.append(dict(arm=arm, name=name, box=box, padded=pad,
                                  ink=[coverage(m, pad) for m in masks],
                                  crop_sha256=sha256(target.read_bytes()).hexdigest()))
        pages.append(dict(key=key, cohort=cohort, chain=chain, truth=truth, gap=gap,
                          photo_sha256=photo_sha, crops=crops))
    (folder/'manifest.json').write_text(json.dumps(pages, indent=2)+'\n')


def report(pages):
    out = {}
    for cohort in COHORTS:
        subset = [p for p in pages if p['cohort'] == cohort]
        assert len(subset) == len({p['chain'] for p in subset}) == 4
        out[cohort] = {}
        for arm in ARMS:
            stats = [status(p, arm) for p in subset]
            out[cohort][arm] = dict(
                exact_chains=sum(s['exact_chain'] for s in stats),
                complete_ordered_pages=sum(s['geometry_exact'] for s in stats),
                exact_complete_rows=sum(r['exact_in_complete_crop'] for s in stats for r in s['rows']),
                complete_rows=sum(r['geometry']=='complete' for s in stats for r in s['rows']),
                extra_crops=sum(s['extra_crops'] for s in stats))
    return out


if __name__ == '__main__':
    if sys.argv[1] == 'freeze':
        build(Path(sys.argv[2]))
    else:
        print(json.dumps(report(json.loads(Path(sys.argv[2]).read_text())), indent=2))
