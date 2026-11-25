"""Freeze human MathWriting InkML renders, run paired literal formula OCR."""
from hashlib import sha256
from itertools import islice
import json
import math
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
from xml.etree import ElementTree

from PIL import Image, ImageDraw
from page_score import literal

ARCHIVE_SHA = 'cba038def001480a89962b25cb20a60df4c4145e94c86ef9d2af65f192cb82bc'
NS = '{http://www.w3.org/2003/InkML}'
PAD, PEN = 13, 4
WIDTH, HEIGHT = 780, 132
SPLITS = ('valid', 'test')
STRATA = ('fraction', 'nonfraction')


def read_ink(raw):
    root = ElementTree.fromstring(raw)
    annotations = {a.get('type'): a.text for a in root.findall(NS + 'annotation')}
    channels = [c.get('name') for c in root.findall(NS + 'traceFormat/' + NS + 'channel')]
    if channels != ['X','Y','T']:
        raise ValueError('Unexpected channel schema')
    traces = []
    for trace in root.findall(NS+'trace'):
        points = [tuple(map(float, coords.split())) for coords in trace.text.split(',')]
        if not all(len(pt)==3 and all(map(math.isfinite, pt)) for pt in points):
            raise ValueError('Unsupported trace point')
        traces.append([pt[:2] for pt in points])
    if not traces or not annotations.get('normalizedLabel'):
        raise ValueError('Missing strokes or reference')
    return annotations, traces


def render(traces):
    xs,ys = zip(*(p for t in traces for p in t), strict=True)
    dx,dy = max(xs)-min(xs),max(ys)-min(ys)
    scale = min(WIDTH/max(dx,1), HEIGHT/max(dy,1))
    left,top = min(xs),min(ys)
    im = Image.new('L',(math.ceil(dx*scale)+2*PAD+1,math.ceil(dy*scale)+2*PAD+1),255)
    draw = ImageDraw.Draw(im)
    stroke = PEN/2
    for t in traces:
        pixels=[(round(PAD+(x-left)*scale), round(PAD+(y-top)*scale)) for x,y in t]
        if len(pixels)>1:
            draw.line(pixels,fill=0,width=PEN,joint='curve')
        # At a pen-down singleton there is no line segment; keep its ink.
        for x,y in pixels:
            draw.ellipse((x-stroke,y-stroke,x+stroke,y+stroke),fill=0)
    return im


def renderer_controls():
    dot=render([[(2.,3.)]])
    assert dot.getpixel((PAD,PAD))==0 and dot.getpixel((0,0))==255
    gap=render([[(0,0),(0,3)],[(3,0),(3,3)]])
    assert gap.getpixel((gap.width//2,gap.height//2))==255
    assert gap.getpixel((PAD,PAD+HEIGHT//2))==0
    assert gap.getpixel((PAD+HEIGHT,PAD+HEIGHT//2))==0


def choose(archive):
    if sha256(archive.read_bytes()).hexdigest()!=ARCHIVE_SHA:
        raise ValueError('Unexpected MathWriting excerpt')
    buckets={(split,stratum):[] for split in SPLITS for stratum in STRATA}
    seen=set()
    with tarfile.open(archive,'r:gz') as tar:
        for m in tar:
            p=PurePosixPath(m.name)
            if not (m.isfile() and len(p.parts)==3 and p.parent.name in SPLITS and p.suffix=='.inkml'):
                continue
            if not 0 < m.size <= 256*1024:
                raise ValueError('Unexpected member size')
            raw=tar.extractfile(m).read()
            ann,traces=read_ink(raw)
            if ann.get('inkCreationMethod')!='human' or ann.get('splitTagOriginal')!=p.parent.name or ann.get('sampleId')!=p.stem or p.stem in seen:
                raise ValueError('Unexpected split, provenance or duplicate ID')
            seen.add(p.stem)
            target=ann['normalizedLabel']
            stratum='fraction' if r'\frac{' in target else 'nonfraction'
            # Use an independently fixed rank, not lexically early archive names.
            rank=sha256(('ywhy-HW07-20261126|'+p.stem).encode()).hexdigest()
            buckets[p.parent.name,stratum].append((rank,p.stem,target,traces,sha256(raw).hexdigest()))
    for key in buckets:
        n=4 if key[1]=='fraction' else 8
        entries=sorted(buckets[key])
        if len(entries)<n:
            raise ValueError('Too few members in stratum')
        for rank, sid, target, traces, source_sha in islice(entries,n):
            yield (*key,sid,target,traces,source_sha)


def freeze(archive,folder):
    renderer_controls()
    folder.mkdir(parents=True,exist_ok=True)
    rows=[]
    for split,stratum,sid,target,traces,source_sha in choose(archive):
        name=f'{split}-{sid}.png'
        im=render(traces)
        path=folder/name; im.save(path)
        rows.append(dict(split=split,stratum=stratum,sample_id=sid,source_sha=source_sha,
                        target=target,name=name,crop_sha256=sha256(path.read_bytes()).hexdigest(),size=im.size))
    # Existing neural runner accepts eight batches. These are transport packs,
    # never successive steps or a reconstruction of any contributor's page.
    manifest=[{'key':f'transport-{k//3+1}','crops':[dict(row,arm='stock') for row in rows[k:k+3]]}
              for k in range(0,len(rows),3)]
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')


def tesseract(folder):
    pages=json.loads((folder/'manifest.json').read_text())
    for pack in pages:
        for row in pack['crops']:
            path=folder/row['name']
            if sha256(path.read_bytes()).hexdigest()!=row['crop_sha256']:
                raise ValueError('Input crop differs from the frozen manifest')
            result=subprocess.run(['tesseract',str(path),'stdout','-l','eng','--psm','7'],
                                  capture_output=True,check=True,timeout=15,
                                  env={**os.environ,'OMP_THREAD_LIMIT':'1'})
            row['raw']=result.stdout.decode().strip()
    return pages


def strict(text):
    # MathWriting uses normalizedLabel. Only the same limited formatting
    # allowances as prior probes; slash is not converted to stacked fraction.
    return literal(text).replace(r'\,','').replace(r'\!','')


def report(stock,baseline):
    rows=[]
    for a,b in zip(stock,baseline,strict=True):
        for u,v in zip(a['crops'],b['crops'],strict=True):
            if {k:x for k,x in u.items() if k!='raw'}!={k:x for k,x in v.items() if k!='raw'}:
                raise ValueError('Engine inputs differ')
            expected=strict(u['target'])
            rows.append((u['split'],u['stratum'],strict(u['raw'])==expected,strict(v['raw'])==expected,
                         bool(strict(u['raw'])),bool(strict(v['raw']))))
    assert len(rows)==24
    def counts(rs):
        return {'samples':len(rs), 'stock_exact':sum(r[2] for r in rs),'tesseract_exact':sum(r[3] for r in rs),
                'both_exact':sum(r[2] and r[3] for r in rs),'stock_blank':sum(not r[4] for r in rs),
                'tesseract_blank':sum(not r[5] for r in rs)}
    return {'all':counts(rows), 'splits':{split:{st:counts([x for x in rows if x[:2]==(split,st)])
                                               for st in STRATA} for split in SPLITS}}


if __name__=='__main__':
    action=sys.argv[1]
    if action=='freeze':
        freeze(Path(sys.argv[2]),Path(sys.argv[3]))
    elif action=='tesseract':
        print(json.dumps(tesseract(Path(sys.argv[2])),indent=2))
    elif action=='score':
        assert strict(r'\[a-1\]')!=strict('a+1')
        assert strict('1/2')!=strict(r'\frac{1}{2}')
        assert strict(r'\[\dfrac{1}{2}\]')==strict(r'\frac{1}{2}')
        print(json.dumps(report(*(json.loads(Path(x).read_text()) for x in sys.argv[2:4])),indent=2))
