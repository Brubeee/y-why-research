"""Private local intake, reference freeze and matched row crop preparation.

No OCR, network, or site behavior changes. Coordinates are half-open LTRB
on the single normalized RGB raster, never on stored JPEG pixels.
"""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct
import sys

from PIL import Image, ImageOps, UnidentifiedImageError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ocr_server import MAX_BYTES, Rejected, image_info

BROWSER_CAP = 6 * 1024**2
RESEARCH_CAP = 32 * 1024**2
DECODE_PIXELS = 50_000_000
LONG_SIDE = 1600
SCHEMA = 'phone-private-v1'
FORMATS = {'JPEG': 'image/jpeg', 'PNG': 'image/png'}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(data):
    return sha256(data).hexdigest()


def pixels(im):
    return digest(b'RGB\x00' + struct.pack('>II', *im.size) + im.tobytes())


def fetch_capture(source):
    with source.open('rb') as s:
        raw = s.read(RESEARCH_CAP + 1)
    if len(raw) > RESEARCH_CAP:
        raise ValueError('research-byte-cap')
    try:
        with Image.open(BytesIO(raw)) as stored:
            if stored.format not in FORMATS:
                raise ValueError('research-format')
            original_size = stored.size
            if (original_size[0]*original_size[1] > DECODE_PIXELS or
                    max(original_size) > 16000):
                raise ValueError('research-dimensions')
            if getattr(stored, 'n_frames', 1) != 1:
                raise ValueError('research-multiframe')
            mime = FORMATS[stored.format]
            orientation = stored.getexif().get(274, 1)
            if type(orientation) is not int or not 1 <= orientation <= 8:
                raise ValueError('research-orientation')
            if 'A' in stored.getbands() or 'transparency' in stored.info:
                raise ValueError('research-transparency')
            upright = ImageOps.exif_transpose(stored).convert('RGB')
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as e:
        raise ValueError('research-decode') from e

    pre_resize = upright.size
    upright.thumbnail((LONG_SIDE, LONG_SIDE), Image.Resampling.LANCZOS)
    # New image preserves pixels and discards all original EXIF/metadata.
    upright = Image.frombytes('RGB', upright.size, upright.tobytes())
    try:
        image_info(raw, mime)
        server_header = 'within-dimension-cap'
    except Rejected as e:
        server_header = f'reject-{e.code}-dimensions-or-header'
    return upright, {
        'schema': SCHEMA, 'original_sha256': digest(raw), 'original_bytes': len(raw),
        'original_size': list(original_size), 'mime': mime, 'exif_orientation': orientation,
        'browser_byte_preflight': 'within-cap' if len(raw) <= BROWSER_CAP else 'reject-byte-cap',
        'server_byte_preflight': 'within-cap' if len(raw) <= MAX_BYTES else 'reject-byte-cap',
        'server_header_preflight': server_header,
        'upright_size_before_resize': list(pre_resize), 'raster_size': list(upright.size),
        'raster_sha256': pixels(upright), 'max_raster_side': LONG_SIDE,
    }


def normalize(source, bundle):
    im, metadata = fetch_capture(source)
    bundle.mkdir(mode=0o700)
    im.save(bundle/'upright.png')
    write_json(bundle/'intake.json', metadata)


def validate_rows(rows, size):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 24:
        raise ValueError('expected 1–24 independently transcribed physical rows')
    height_last = 0
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'literal', 'box'}:
            raise ValueError('expected literal and LTRB box for each row')
        literal, box = row['literal'], row['box']
        if not isinstance(literal, str) or not literal.strip() or len(literal) > 512:
            raise ValueError('expected a non-empty written line')
        if not isinstance(box,list) or len(box) != 4 or not all(type(x) is int for x in box):
            raise ValueError('invalid LTRB box')
        l,t,r,b = box
        if not (0 <= l < r <= size[0] and height_last <= t < b <= size[1]):
            raise ValueError('box outside raster, overlapping, or out of physical order')
        height_last = b


def freeze(bundle, reference):
    metadata = json.loads((bundle/'intake.json').read_text())
    if metadata.get('schema') != SCHEMA:
        raise ValueError('intake schema mismatch')
    im = Image.open(bundle/'upright.png')
    if im.mode != 'RGB' or list(im.size) != metadata['raster_size'] or pixels(im) != metadata['raster_sha256']:
        raise ValueError('upright raster differs from intake')
    ref = json.loads(reference.read_text())
    if not isinstance(ref, dict) or set(ref) != {'raster_sha256','rows'}:
        raise ValueError('reference must bind raster_sha256 and rows')
    if ref['raster_sha256'] != metadata['raster_sha256']:
        raise ValueError('reference points to a different upright raster')
    validate_rows(ref['rows'], im.size)
    with (bundle/'frozen.json').open('x', encoding='utf-8') as f:
        json.dump({'intake': metadata, 'rows': ref['rows']}, f, ensure_ascii=False, indent=2)
        f.write('\n')


def prepare(bundle, crops_dir):
    # Verify the saved binding again. Do not use OCR to infer reference geometry.
    from page_geometry import proposals

    frozen_bytes = (bundle/'frozen.json').read_bytes()
    f = json.loads(frozen_bytes)
    expected = f['intake']
    im = Image.open(bundle/'upright.png')
    if im.mode != 'RGB' or list(im.size) != expected['raster_size'] or pixels(im) != expected['raster_sha256']:
        raise ValueError('upright raster differs from frozen reference')
    validate_rows(f['rows'], im.size)
    pad = round(12*max(1, min(im.size)/365))
    refs = [row['box'] for row in f['rows']]
    def reference_pad(i, box):
        l,t,r,b = box
        y0 = (refs[i-1][3]+t)//2 if i else 0
        y1 = (b+refs[i+1][1])//2 if i+1 < len(refs) else im.height
        return (max(l-pad,0), max(t-pad,y0), min(r+pad,im.width), min(b+pad,y1))

    arms = {'oracle': [(r,reference_pad(i,r)) for i,r in enumerate(refs)],
            'detector': proposals(im),
            'rule_mask_detector': proposals(im,suppress_ruling=True)}
    crops_dir.mkdir(mode=0o700)
    manifest = []
    for arm, boxes in arms.items():
        for i, (box,padded) in enumerate(boxes,1):
            name = f'{arm}-{i:02d}.png'
            path = crops_dir/name
            im.crop(padded).save(path)
            manifest.append({'arm':arm,'name':name,'box':list(box),'padded':list(padded),
                             'crop_sha256':digest(path.read_bytes())})
    write_json(crops_dir/'manifest.json', [{'key':'private-capture','crops':manifest}])
    write_json(crops_dir/'binding.json', {'raster_sha256':expected['raster_sha256'],
                'frozen_sha256':digest(frozen_bytes),
                'manifest_sha256':digest((crops_dir/'manifest.json').read_bytes()),
                'counts':{k:len(v) for k,v in arms.items()}})


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('action', choices=('normalize','freeze','prepare'))
    cli.add_argument('first', type=Path)
    cli.add_argument('second', type=Path)
    args = cli.parse_args()
    {'normalize':normalize,'freeze':freeze,'prepare':prepare}[args.action](args.first,args.second)
