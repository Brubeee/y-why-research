"""Freeze paired full-page synthetic fixtures before testing any recognizer."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ocr_server import draft_ocr

# Fractions are rendered vertically; the literal target preserves that structure.
# Last rows deliberately close to the lower edge; error(s) preserved verbatim.
CASES = {
    'bottom-negative-error': (('7a+15=1', ('7a+15=1',)), ('7a=-14', ('7a=−14',)), ('a=2', ('a=2',))),
    'stacked-variable': (('\\frac{v}{6}+2=5', (('v','6'),'+2=5')), ('\\frac{v}{6}=3', (('v','6'),'=3')), ('v=18', ('v=18',))),
    'stacked-wrong-step': (('\\frac{3h}{5}-2=4', (('3h','5'),'−2=4')), ('\\frac{3h}{5}=2', (('3h','5'),'=2')), ('3h=10', ('3h=10',))),
    'negative-brackets': (('-4(2j-3)=20', ('−4(2j−3)=20',)), ('-8j+12=20', ('−8j+12=20',)), ('j=-1', ('j=−1',))),
}
W, H = 640, 365
PAD = 12
BASELINES = (88, 208, 346)


def paint_row(parts, baseline, noisy):
    im = Image.new('L', (W,H))
    draw = ImageDraw.Draw(im)
    face = 'DejaVuSerif-Italic.ttf' if noisy else 'DejaVuSerif.ttf'
    font, mini = (ImageFont.truetype(face, n) for n in (38,30))
    x = 79
    for token in parts:
        if isinstance(token, tuple):
            top, bottom = token
            line = baseline - 13
            width = round(max(mini.getlength(top),mini.getlength(bottom)))+12
            lower_top = mini.getbbox(bottom,anchor='ls')[1]
            draw.text((x+width//2,line-6),top,font=mini,anchor='ms',fill=255)
            draw.line((x,line,x+width,line),fill=255,width=2)
            draw.text((x+width//2,line+6-lower_top),bottom,font=mini,anchor='ms',fill=255)
            x += width+5
        else:
            draw.text((x,baseline),token,font=font,anchor='ls',fill=255)
            x += round(font.getlength(token))
    if noisy:
        im = im.rotate(-3, Image.Resampling.BICUBIC)
    return im


def bounds(rect, size, pad):
    l,t,r,b=rect
    return max(0,l-pad),max(0,t-pad),min(size[0],r+pad),min(size[1],b+pad)


def payload(masks, noisy):
    page=Image.new('L',(W,H),255)
    if noisy:
        pixels=page.load()
        for y in range(H):
            for x in range(W):
                pixels[x,y]=250-x//64-y//110 + ((x*13+y*29)%7)-3
    for mask in masks:
        page.paste(36,(0,0,W,H),mask)
    output=BytesIO()
    if noisy:
        page.filter(ImageFilter.GaussianBlur(.65)).save(output,'JPEG',quality=72)
    else:
        page.save(output,'PNG')
    return output.getvalue()


def tsv_rect(line):
    b=line['box']
    return b['x'],b['y'],b['x']+b['width'],b['y']+b['height']


def coverage(mask, rect):
    histogram=mask.crop(rect).histogram()
    total=sum(mask.histogram()[64:])
    return round(sum(histogram[64:])/total,6)


def build(folder):
    folder.mkdir(exist_ok=True, parents=True)
    pages=[]
    for case,data in CASES.items():
        for noisy in (False,True):
            variant='phone-style-render' if noisy else 'clean-printed'
            key=f'{case}--{variant}'
            masks=[paint_row(parts,y,noisy) for (_,parts),y in zip(data,BASELINES,strict=True)]
            raw=payload(masks,noisy)
            suffix='jpeg' if noisy else 'png'
            (folder/f'{key}.{suffix}').write_bytes(raw)
            photo=Image.open(BytesIO(raw)).convert('L')
            crops=[]
            detections=draft_ocr(raw,'image/'+suffix)['lines']
            for arm,rows in [('oracle',[m.getbbox() for m in masks]),('detector',[tsv_rect(d) for d in detections])]:
                for i,rect in enumerate(rows):
                    padded=bounds(rect,photo.size,PAD)
                    name=f'{key}--{arm}-{i+1}.png'
                    target=folder/name
                    photo.crop(padded).save(target)
                    crops.append(dict(arm=arm,name=name,box=rect,padded=padded,
                                      ink=[coverage(m,padded) for m in masks],
                                      crop_sha256=sha256(target.read_bytes()).hexdigest(),
                                      **({'detector_text':detections[i]['text']} if arm=='detector' else {})))
            pages.append(dict(key=key,cohort=variant,chain=case,truth=[s for s,_ in data],
                              photo_sha256=sha256(raw).hexdigest(),crops=crops))
    (folder/'manifest.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    build(Path(sys.argv[1]))
