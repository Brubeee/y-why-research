"""Local-only asymmetric JPEG orientation probe; all image and math content is synthetic."""
import argparse
import base64
from io import BytesIO
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from ocr_server import draft_ocr, image_info

WIDTH, HEIGHT = 640, 440
ORIENTATIONS = (1, 2, 3, 6)
COLORS = {'red': (218,30,46), 'green': (20,161,100), 'blue': (36,76,225), 'yellow': (245,184,44)}
EXPECTED_CORNERS = {
    1: ['red', 'green', 'blue', 'yellow'],
    2: ['green', 'red', 'yellow', 'blue'],
    3: ['yellow', 'blue', 'green', 'red'],
    6: ['blue', 'red', 'yellow', 'green'],
}
ROWS = ('3x + 12 = 24', '3x = 12', 'x = 4')

def fixture(orientation):
    """Identical encoded JPEG pixels; modify EXIF orientation tag only."""
    if orientation not in ORIENTATIONS:
        raise ValueError('Unexpected test orientation')
    im = Image.new('RGB', (WIDTH, HEIGHT), 'white')
    d = ImageDraw.Draw(im)
    for (x, y), rgb in zip([(0,0), (WIDTH-38,0), (0,HEIGHT-38), (WIDTH-38,HEIGHT-38)], COLORS.values()):
        d.rectangle((x,y,x+37,y+37), fill=rgb)
    font = ImageFont.load_default(size=38)
    for i, line in enumerate(ROWS):
        d.text((87,98+60*i),line,fill='black',font=font)
    exif = Image.Exif()
    exif[274] = orientation
    out = BytesIO()
    im.save(out,'JPEG',quality=93,subsampling=0,exif=exif)
    return out.getvalue()

def sample(im):
    w,h=im.size
    near=lambda p:min(COLORS,key=lambda c:sum((a-b)**2 for a,b in zip(p,COLORS[c])))
    return [near(im.getpixel(p)) for p in [(18,18),(w-19,18),(18,h-19),(w-19,h-19)]]

def report():
    result=[]
    for o in ORIENTATIONS:
        data=fixture(o)
        with Image.open(BytesIO(data)) as im:
            assert im.getexif()[274]==o
            upright=ImageOps.exif_transpose(im)
            result.append({
                'orientation':o,'server_encoded_size':image_info(data,'image/jpeg')[1:],
                'raw_corners':sample(im),'pillow_exif_size':upright.size,'pillow_exif_corners':sample(upright),
                'ocr':draft_ocr(data,'image/jpeg')['lines'],
            })
    return result

def browser_html():
    """Self-contained repro for future normal browser/manual run (no files uploaded)."""
    photos={str(i):'data:image/jpeg;base64,'+base64.b64encode(fixture(i)).decode('ascii') for i in ORIENTATIONS}
    return '''<!doctype html><meta charset="utf-8"><title>Local asymmetric JPEG probe</title>
<pre id="out">Running local synthetic decode...</pre><script>
const photos = '''+json.dumps(photos)+''';
const rgb = '''+json.dumps(COLORS)+''';
const wanted = '''+json.dumps(EXPECTED_CORNERS)+''';
const near = (p) => Object.entries(rgb).map(([k,c])=>[k,c.reduce((s,x,i)=>s+(x-p[i])**2,0)]).sort((a,b)=>a[1]-b[1])[0][0];
(async()=> {
  const results=[];
  for(const [tag,url] of Object.entries(photos)) {
    const im=new Image();im.src=url;await im.decode();
    const [w,h]=[im.naturalWidth,im.naturalHeight];
    const full=document.createElement('canvas');full.width=w;full.height=h;
    const ctx=full.getContext('2d');ctx.drawImage(im,0,0,w,h);
    const points=[[18,18],[w-19,18],[18,h-19],[w-19,h-19]];
    const pixels=points.map(([x,y])=>near(ctx.getImageData(x,y,1,1).data));
    const crop=document.createElement('canvas');crop.width=16;crop.height=16;
    const box=crop.getContext('2d');box.drawImage(im,10,10,16,16,0,0,16,16);
    const exported=new Image();exported.src=crop.toDataURL('image/png');await exported.decode();
    box.clearRect(0,0,16,16);box.drawImage(exported,0,0);
    const roundtrip=near(box.getImageData(8,8,1,1).data);
    results.push({tag,width:w,height:h,pixels,roundtrip,canonical:w===(tag==='6'?440:640)&&h===(tag==='6'?640:440)&&JSON.stringify(pixels)===JSON.stringify(wanted[tag])&&roundtrip===wanted[tag][0]});
  }
  document.querySelector('#out').textContent=JSON.stringify(results,null,2);
  document.body.dataset.done='yes';
})().catch(e=>{document.querySelector('#out').textContent=String(e);document.body.dataset.done='error';});
</script>'''

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--browser-html',type=Path)
    a=p.parse_args()
    if a.browser_html:
        a.browser_html.write_text(browser_html(),encoding='utf-8')
    else:
        print(json.dumps(report(),indent=2))
