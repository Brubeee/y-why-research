"""Build bounded synthetic OCR controls and upstream-style input tensors."""
import hashlib
import json
from pathlib import Path
import random
import struct
from collections import Counter
from PIL import Image, ImageDraw, ImageFont, ImageFilter

N = 448
MEAN, STD = 0.9545467, 0.15394445
ROOT = Path(__file__).resolve().parent
CHAIN = (
    ('brackets-error', ('5(2p−7)=15','10p−7=15','10p=22')),
    ('brackets-valid', ('3(4r+5)=39','12r+15=39','r=2')),
    ('negative-error', ('−2n+9=17','−2n=8','n=4')),
    ('inline-fraction', ('s/8+3/4=11/8','s/8=5/8','s=5')),
    ('cross-terms', ('7k−6=3k+18','4k=24','k=6')),
    ('fraction-error', ('2w/7−1/3=11/21','2w/7=4/21','w=2/3')),
)


def transform(im):
    im=im.convert('RGB')
    w,h=im.size
    px=im.load()
    bg=Counter(px[x,y] for x,y in ((0,0),(w-1,0),(0,h-1),(w-1,h-1))).most_common(1)[0][0]
    l,t,r,b=w,h,-1,-1
    for y in range(h):
        for x in range(w):
            diff=tuple(abs(a-c) for a,c in zip(px[x,y],bg))
            # Upstream calls cv2.COLOR_BGR2GRAY for its difference mask.
            if round(.114*diff[0]+.587*diff[1]+.299*diff[2])>15:
                l,t,r,b=min(l,x),min(t,y),max(r,x),max(b,y)
    if r<l:
        return None
    iw,ih=r-l+1,b-t+1
    scale=min((N-1)/min(iw,ih),N/max(iw,ih))
    nw,nh=max(1,int(iw*scale+1e-9)),max(1,int(ih*scale+1e-9))
    trimmed=im.crop((l,t,r+1,b+1)).convert('L').resize((nw,nh),Image.Resampling.BICUBIC)
    values=bytearray(N*N*4)  # normalized tensor zeros, not white pixels
    for y in range(nh):
        for x in range(nw):
            struct.pack_into('<f',values,(y*N+x)*4,(trimmed.getpixel((x,y))/255-MEAN)/STD)
    return bytes(values),(nw,nh)


def paint(text, *, noisy, rng):
    tile=Image.new('RGB',(430,96),(251,249,243) if noisy else 'white')
    draw=ImageDraw.Draw(tile)
    font=ImageFont.truetype('DejaVuSerif-Italic.ttf' if noisy else 'DejaVuSansMono.ttf', 33)
    x=20
    if noisy:
        for y0 in range(0,96,5):
            for x0 in range(0,430,5):
                shade=248-(9*x0)//430+rng.randrange(-3,4)
                draw.rectangle((x0,y0,x0+4,y0+4),fill=(shade,min(255,shade+1),shade-5))
    for c in text:
        y=57+rng.randrange(-2,3) if noisy else 57
        draw.text((x,y),c,font=font,fill=(59,52,41) if noisy else (26,26,26),anchor='ls')
        x+=round(font.getlength(c))+(rng.randrange(-1,3) if noisy else 0)
    # The transformation is matched for all recognizers, never chosen from output.
    tile=tile.crop((5,5,min(x+15,430),86))
    if noisy:
        from io import BytesIO
        tile=tile.rotate(-3,Image.Resampling.BICUBIC,expand=True,fillcolor=(245,245,238)).filter(ImageFilter.GaussianBlur(.65))
        buf=BytesIO()
        tile.save(buf,'JPEG',quality=70,subsampling=2)
        tile=Image.open(BytesIO(buf.getvalue())).convert('RGB')
    return tile


def build():
    out=ROOT/'frozen_oracle_01b'
    out.mkdir(exist_ok=True)
    cases=[]
    for chain,rows in CHAIN:
        for cohort in ('clean-printed','phone-style-render'):
            for i,text in enumerate(rows,1):
                key=f'{chain}-{cohort}-{i}'
                im=paint(text,noisy=cohort!='clean-printed',rng=random.Random('ywhy-oracle-01-'+key))
                png=out/(key+'.png')
                im.save(png)
                tensor,dims=transform(im)
                (out/(key+'.f32')).write_bytes(tensor)
                cases.append(dict(key=key,chain=chain,cohort=cohort,index=i,truth=text,
                    image_sha=hashlib.sha256(png.read_bytes()).hexdigest(),input_wh=dims))
    (out/'manifest.json').write_text(json.dumps(cases,indent=2,ensure_ascii=False)+'\n')
    return out


def self_test():
    im=Image.new('RGB',(200,100),'white')
    assert transform(im) is None
    ImageDraw.Draw(im).rectangle((10,20,109,69),fill='black')
    data,(w,h)=transform(im)
    assert (w,h)==(448,224) and len(data)==448*448*4
    value=lambda x,y:struct.unpack_from('<f',data,4*(y*448+x))[0]
    assert abs(value(0,0)+MEAN/STD)<1e-6
    assert value(0,224)==0.0 and value(447,447)==0.0
    im=Image.new('RGB',(200,210),'white')
    ImageDraw.Draw(im).rectangle((10,20,109,119),fill=(200,200,200))
    data,dims=transform(im)
    assert dims==(447,447)
    assert struct.unpack_from('<f',data,4*447)[0]==0.0


if __name__=='__main__':
    self_test()
    print(build())
