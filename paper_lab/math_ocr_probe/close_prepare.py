"""Freeze promising and adverse layout variants, before scoring OCR."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFilter
from page_prepare import W,H,bounds,tsv_rect,coverage,paint_row,draft_ocr
from page_geometry import proposals

CASES=(
    ('fraction-close',((r'\frac{m}{9}+1=4',(('m','9'),'+1=4')), (r'\frac{m}{9}=5',(('m','9'),'=5')),('m=45',('m=45',))), 9),
    ('fraction-wide',((r'\frac{y}{7}-2=1',(('y','7'),'−2=1')), (r'\frac{y}{7}=3',(('y','7'),'=3')),('y=21',('y=21',))), 32),
    ('separate-close',(('8b-9=23',('8b−9=23',)),('8b-9=24',('8b−9=24',)),('b=4',('b=4',))), 9),
    ('separate-wide',(('6t-2=16',('6t−2=16',)),('6t-2=15',('6t−2=15',)),('t=3',('t=3',))), 32),
)
PAD=12


def page(masks,noisy):
    im=Image.new('L',(W,H),255)
    if noisy:
        px=im.load()
        for y in range(H):
            for x in range(W):
                px[x,y]=244+x//60-(y*13)//H+((13*x+29*y)%13)-6
        d=ImageDraw.Draw(im)
        # Pale and dark rules exercise background/long-rule suppression.
        for y in range(32,H,48):
            d.line((25,y,W-25,y),fill=173,width=1)
    for mask in masks:
        im.paste(37,(0,0,W,H),mask)
    f=BytesIO()
    if noisy:
        im.filter(ImageFilter.GaussianBlur(.55)).save(f,'JPEG',quality=75)
    else:
        im.save(f,'PNG')
    return f.getvalue()


def build(folder):
    folder.mkdir(parents=True,exist_ok=True)
    pages=[]
    for case,data,gap in CASES:
        for noisy in (False,True):
            cohort='phone-style-render' if noisy else 'clean-printed'
            key=f'{case}--{cohort}'
            # Translate masks to exact intended gap (including font/tilt variation).
            first=paint_row(data[0][1],96,noisy)
            second=paint_row(data[1][1],198,noisy)
            move=first.getbbox()[3]+gap-second.getbbox()[1]
            translated=Image.new('L',(W,H))
            translated.paste(second,(0,move))
            last=paint_row(data[2][1],346,noisy)
            masks=[first,translated,last]
            rects=[m.getbbox() for m in masks]
            assert rects[1][1]-rects[0][3]==gap and rects[2][1]>rects[1][3]
            raw=page(masks,noisy)
            suffix='jpeg' if noisy else 'png'
            (folder/f'{key}.{suffix}').write_bytes(raw)
            photo=Image.open(BytesIO(raw)).convert('L')
            base=[tsv_rect(r) for r in draft_ocr(raw,'image/'+suffix)['lines']]
            def standard(rows):
                return [(r,bounds(r,photo.size,PAD)) for r in rows]
            arms=(('oracle',standard(rects)),('detector',standard(base)),('geometry',proposals(photo)))
            crops=[]
            for arm,boxes in arms:
                for i,(box,padded) in enumerate(boxes,1):
                    name=f'{key}--{arm}-{i}.png'
                    target=folder/name
                    photo.crop(padded).save(target)
                    crops.append(dict(arm=arm,name=name,box=box,padded=padded,
                                      ink_before_pad=[coverage(m,box) for m in masks],
                                      ink=[coverage(m,padded) for m in masks],
                                      crop_sha256=sha256(target.read_bytes()).hexdigest()))
            pages.append(dict(key=key,cohort=cohort,chain=case,truth=[s for s,_ in data],first_gap_px=gap,
                              photo_sha256=sha256(raw).hexdigest(),crops=crops))
    (folder/'manifest.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    build(Path(sys.argv[1]))
