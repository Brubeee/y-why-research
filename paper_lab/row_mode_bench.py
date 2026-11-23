"""Frozen synthetic oracle-crop OCR experiment, offline and not app code."""
from collections import Counter
from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont
from ocr_bench import normalize, align, overlap, verdict_for
from ocr_server import draft_ocr, parse_tsv

TRUTH={
 'false_error': ('2x+6=0',None,'−2x=6'),
 'false_pass': ('5x−10=0',None,'x=−2'),
 'cancel': ('3x+9=0','x=3','x=−3'),
}
GRAY=(40,160,216)
PAD=24
HERE=Path(__file__).resolve().parent

def build(kind,g):
    font=ImageFont.truetype('DejaVuSansMono.ttf',44)
    photo=Image.new('RGB',(680,450),(247,245,237))
    draw=ImageDraw.Draw(photo)
    rows=[]
    for i,txt in enumerate(TRUTH[kind]):
        if txt is None: continue
        x,y=88,62+i*108
        rb=draw.textbbox((x,y),txt,font=font)
        sign=txt.index('−') if i==2 else None
        mark=None
        for j,ch in enumerate(txt):
            pos=(x+round(j*font.getlength('0')),y)
            draw.text(pos,ch,font=font,fill=(g,g,g) if j==sign else (40,40,40))
            if j==sign:
                # Font's bounding box contains white leading/trailing rows; measure actual stroke.
                stamp=Image.new('L',(60,70))
                ImageDraw.Draw(stamp).text((0,0),ch,font=font,fill=255)
                crop=stamp.getbbox()
                mark=tuple(v+pos[k%2] for k,v in enumerate(crop))
        if i==1:
            draw.line((x-10,y+27,rb[2]+10,y+27),fill=(55,55,55),width=3)
        rows.append(dict(id=f'r{i}',text=txt,status='canceled' if i==1 else 'active',
            transition='invalid' if kind=='false_pass' and i==2 else 'start' if i==0 else 'valid' if i==2 else 'ignored',
            box=dict(x=rb[0]-7,y=rb[1]-4,width=rb[2]-rb[0]+14,height=rb[3]-rb[1]+8),mark=mark))
    buffer=BytesIO();photo.save(buffer,format='JPEG',quality=84,subsampling=0)
    return dict(id=f'{kind}-{g}',support='bounded_linear',rows=rows,kind=kind,gray=g),buffer.getvalue()

def rect(b):
    return (b['x'],b['y'],b['x']+b['width'],b['y']+b['height'])

def ocr_crop(image,row,mode,temp,inspect_mark):
    r=rect(row['box'])
    piece=image.crop(r)
    padded=Image.new('RGB',(piece.width+PAD*2,piece.height+PAD*2),'white')
    padded.paste(piece,(PAD,PAD))
    crop=temp/'oracle.png'; padded.save(crop)
    out=temp/'diagnostic'
    processed=out.with_suffix('.processed.tif')
    processed.unlink(missing_ok=True)
    cmd=['tesseract',str(crop),str(out),'-l','eng','--psm',str(mode),'tsv']
    if inspect_mark: cmd.append('get.images')
    subprocess.run(cmd,check=True,capture_output=True,timeout=15,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
    lines=parse_tsv(out.with_suffix('.tsv').read_text(),*padded.size)
    mark_info=None
    if inspect_mark:
        with Image.open(processed) as bitmap:
            roi=tuple(v-r[i%2]+PAD for i,v in enumerate(row['mark']))
            if bitmap.size!=padded.size or bitmap.mode not in ('1','L'):
                raise ValueError('Unexpected processed bitmap cannot be compared to frozen glyph.')
            px=bitmap.convert('L').crop(roi)
            n=sum(px.histogram()[:128])
            mark_info={'black_pixels':n,'roi_pixels':px.width*px.height,'survives_any_black':n>0}
    return lines,mark_info

def score(page,mode,photo,temp,page_bytes):
    rows=page['rows']
    if mode==3:
        full=draft_ocr(page_bytes,'image/jpeg')['lines']
        by_id=align(rows,full)
    scores=[]
    active_indexes=[]
    for i,row in enumerate(rows):
        if mode==3:
            idx=by_id.get(row['id'])
            drafts=[line for line in full if overlap(line['box'],row['box'])>=.5]
            line=full[idx] if idx is not None else None
            mark=None
        else:
            drafts,mark=ocr_crop(photo,row,mode,temp,row['mark'] is not None)
            line=drafts[0] if len(drafts)==1 else None
            idx=i if line else None  # supplied by oracle, not claimed OCR order
        literal=line['text'] if line else None
        norm=normalize(row['text'])
        observed=normalize(literal) if literal is not None else None
        confidence=[w['confidence'] for w in line['words']] if line else []
        if row['status']=='active' and idx is not None: active_indexes.append(idx)
        sign_drop=False
        if row['mark'] is not None and observed is not None:
            j=norm.index('-')
            sign_drop=observed==norm[:j]+norm[j+1:]
        scores.append(dict(id=row['id'],status=row['status'],transition=row['transition'],
                    index=idx,reference=row['text'],candidate=literal,exact=observed==norm,
                    uncertain=not confidence or any(w is None or w<70 for w in confidence),
                    drafts=[d['text'] for d in drafts],isolated_sign_drop=sign_drop,processed_mark=mark))
    if active_indexes!=sorted(active_indexes):
        for row in scores:
            if row['status']=='active': row['uncertain']=True
    return {**page,'rows':scores}

def run():
    frozen=[build(k,g) for k in TRUTH for g in GRAY]
    result={'image_hashes':{p['id']:hashlib.sha256(data).hexdigest() for p,data in frozen},
            'protocol':'Synthetic only. Oracle crops select geometry, never OCR text or math verdict. Cancellation regions inspected separately, excluded from active chain by truth labels; not automatic cancellation.'}
    with TemporaryDirectory() as proc:
        for mode in (3,7,13):
            pages=[score(p,mode,Image.open(BytesIO(data)),Path(proc),data) for p,data in frozen]
            verdicts=verdict_for(pages,gate_confidence=False)
            c=Counter(false_pass=0,false_error=0,mark_rois=0,mark_rois_with_ink=0)
            for p in pages:
                for row in p['rows']:
                    if row['status']=='canceled':
                        c['cancel_rows']+=1;c['cancel_with_any_text']+=bool(row['drafts'])
                        c['cancel_exact']+=row['exact']
                    else:
                        c['active_rows']+=1;c['active_exact']+=row['exact']
                        c['active_unaligned']+=row['candidate'] is None
                        c['active_unaligned_with_fragments']+=row['candidate'] is None and bool(row['drafts'])
                        c['isolated_sign_drops']+=row['isolated_sign_drop']
                        if row['processed_mark'] is not None:
                            c['mark_rois']+=1;c['mark_rois_with_ink']+=row['processed_mark']['survives_any_black']
            for case in verdicts['cases']:
                actual=case['observed']['verdict']
                if case['reference']['verdict']=='changed': c['written_error_cases']+=1
                else: c['written_pass_cases']+=1
                if actual=='ok' and case['reference']['verdict']=='changed': c['false_pass']+=1
                if actual=='changed' and case['reference']['verdict']=='ok': c['false_error']+=1
            result['psm'+str(mode)]=dict(counts=dict(c),pages=pages,verdicts=verdicts)
    return result

if __name__=='__main__':
    print(json.dumps(run(),indent=2))
