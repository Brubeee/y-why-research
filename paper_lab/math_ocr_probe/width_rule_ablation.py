"""Paired diagnostic: x aperture and synthetic rule paint, no detector tuning."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter
from close_prepare import CASES, W, H, paint_row
from page_score import literal


def render(masks, ruled):
    im=Image.new('L',(W,H))
    px=im.load()
    for y in range(H):
        for x in range(W):
            px[x,y]=244+x//60-(y*13)//H+((13*x+29*y)%13)-6
    if ruled:
        d=ImageDraw.Draw(im)
        for y in range(32,H,48):
            d.line((25,y,W-25,y),fill=173,width=1)
    for mask in masks:
        im.paste(37,(0,0,W,H),mask)
    output=BytesIO()
    im.filter(ImageFilter.GaussianBlur(.55)).save(output,'JPEG',quality=75)
    return output.getvalue()


def build(folder):
    folder.mkdir(parents=True,exist_ok=True)
    frozen=json.loads(Path(__file__).with_name('close-03-results.json').read_text())
    width_reference={p['chain']:p for p in frozen if p['cohort']=='phone-style-render'}
    pages=[]
    for key,source,gap in CASES:
        target=width_reference[key]
        ref=[x for x in target['crops'] if x['arm']=='oracle']
        base=[x for x in target['crops'] if x['arm']=='geometry']
        masks=[]
        for i,(_,parts) in enumerate(source):
            im=paint_row(parts,(96,198,346)[i],True)
            l,t,r,b=im.getbbox()
            x=(W-(r-l))//2
            image=Image.new('L',(W,H))
            # Move the full bounding ink once; both treatments share this pixel mask.
            image.paste(im.crop((l,t,r,b)),(x,ref[i]['box'][1]))
            masks.append(image)
        assert masks[1].getbbox()[1]-masks[0].getbbox()[3]==gap
        for ruled in (False,True):
            raw=render(masks,ruled)
            photo=Image.open(BytesIO(raw)).convert('L')
            variant='ruled' if ruled else 'unruled'
            identifier=f'{key}--{variant}'
            crops=[]
            for i,mask in enumerate(masks):
                m=mask.getbbox()
                y0,y1=base[i]['padded'][1::2]
                assert y0<=m[1]<m[3]<=y1
                assert not any(y0<b.getbbox()[3] and y1>b.getbbox()[1] for j,b in enumerate(masks) if j!=i)
                for arm,src in [('narrow',ref),('wide',base)]:
                    x0,x1=src[i]['padded'][::2]
                    width=x1-x0
                    x=(W-width)//2
                    name=f'{identifier}--{arm}-{i+1}.png'
                    p=folder/name
                    photo.crop((x,y0,x+width,y1)).save(p)
                    center=(m[0]+m[2])/2
                    crops.append(dict(arm=arm,name=name,index=i,box=[x,y0,x+width,y1],
                                      glyph_center=round((center-x)/width,6),
                                      crop_sha256=sha256(p.read_bytes()).hexdigest()))
            pages.append(dict(key=identifier,chain=key,cohort=variant,truth=target['truth'],
                              photo_sha256=sha256(raw).hexdigest(),crops=crops))
    (folder/'manifest.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2)+'\n')


def summary(pages):
    out={}
    assert len(pages)==8
    for kind in ('unruled','ruled'):
        for arm in ('narrow','wide'):
            exact=[]
            for p in pages:
                if p['cohort']!=kind:
                    continue
                selected=[c for c in p['crops'] if c['arm']==arm]
                assert [c['index'] for c in selected]==[0,1,2]
                assert all(abs(c['glyph_center']-.5)<.01 for c in selected)
                exact.append([literal(c['raw'])==literal(p['truth'][c['index']]) for c in selected])
            out[f'{kind}/{arm}']={'rows':sum(sum(e) for e in exact),'total_rows':12,
                                  'exact_chains':sum(all(e) for e in exact),'chains':4}
    return out


if __name__=='__main__':
    if sys.argv[1]=='build':
        build(Path(sys.argv[2]))
    else:
        print(json.dumps(summary(json.loads(Path(sys.argv[2]).read_text())),indent=2))
