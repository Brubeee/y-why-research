"""Frozen, offline typeset-photo stress test. Not connected to the Y? app."""
from collections import Counter
import hashlib
from io import BytesIO
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont, __version__ as pillow
from ocr_bench import score_page, normalize, overlap, compare_candidate, verdict_for
from ocr_server import draft_ocr

# Fixed before reading either OCR engine. Text is authored, not engine generated.
CHAINS = {
    'rhs': [('3x = −12','active','start'),('x = 4','canceled','ignored'),('x = −4','active','valid')],
    'left': [('−(x − 4) = 12','active','start'),('−x + 4 = 12','canceled','ignored'),
             ('−x − 4 = 12','active','invalid'),('x = −16','active','not_considered')],
}
INTENSITIES=(39,160,216)  # Gray values on warm gray paper, no tuning afterward.
MARKS=('single','scribble')
FONT_NAME='DejaVuSansMono.ttf'

def fixture(chain,gray,mark):
    font=ImageFont.truetype(FONT_NAME,45)
    canvas=Image.new('RGB',(850,740),(247,245,237))
    draw=ImageDraw.Draw(canvas)
    rows=[]
    for i,(sentence,status,transition) in enumerate(CHAINS[chain]):
        x,y=100,105+105*i
        faint_index=sentence.find('−') if status=='active' else -1
        for j,c in enumerate(sentence):
            draw.text((x+round(j*font.getlength('0')),y),c,font=font,
                      fill=(gray,gray,gray) if j==faint_index else (39,39,39))
        end=x+round(font.getlength(sentence))
        if status=='canceled':
            draw.line((x-12,y+27,end+12,y+30),fill=(35,35,35),width=3)
            if mark=='scribble':
                draw.line([(x-10,y+44),(x+45,y+12),(x+100,y+43),(end+7,y+13)],fill=(45,45,45),width=4)
        rows.append(dict(id=f'r{i}',text=sentence,status=status,transition=transition,
                         box=dict(x=x-24,y=y-5,width=end-x+60,height=68),
                         sign_side=('lhs' if faint_index<sentence.index('=') else 'rhs') if faint_index>=0 else None))
    f=BytesIO()
    canvas.save(f,'JPEG',quality=84,subsampling=0,optimize=False)
    return dict(id=f'{chain}-{gray}-{mark}',width=850,height=740,rows=rows,
                support='bounded_linear',condition=f'{gray}-{mark}',layout_cohort=chain),f.getvalue()


def run():
    fixtures=[fixture(c,g,m) for c in CHAINS for g in INTENSITIES for m in MARKS]
    manifest={'images':{page['id']:hashlib.sha256(data).hexdigest() for page,data in fixtures},
              'truth_sha256':hashlib.sha256(json.dumps([p for p,_ in fixtures],sort_keys=True).encode()).hexdigest()}
    results={}
    with TemporaryDirectory() as tmp:
        for page,data in fixtures:
            file=Path(tmp)/'synthetic.jpg';file.write_bytes(data)
            strategies={'baseline_psm3':draft_ocr(data,'image/jpeg')['lines'],
                        'sparse_psm11':compare_candidate(file,page)}
            for name,lines in strategies.items():
                score=score_page(page,lines)
                for r,truth in zip(score['rows'],page['rows'],strict=True):
                    r['sign_side']=truth['sign_side']
                    if r['status']=='canceled':
                        # Count fragments as cancel ink surfaced too, not just successfully aligned OCR rows.
                        r['overlapping_drafts']=[line['text'] for line in lines if overlap(line['box'],truth['box'])>=.5]
                results.setdefault(name,[]).append(score)
    return dict(manifest=manifest,engine={'tesseract':subprocess.check_output(['tesseract','--version'],text=True).splitlines()[0],
                                         'pillow':pillow},
            strategies={name:dict(summary=summarize(scores),verdict={'gated':verdict_for(scores),
                         'ungated':verdict_for(scores,gate_confidence=False)},pages=scores)
                         for name,scores in results.items()})


def summarize(pages):
    counts=Counter()
    for p in pages:
        for r in p['rows']:
            if r['status']=='canceled':
                counts['canceled_total']+=1
                counts['canceled_with_draft']+=bool(r['overlapping_drafts'])
                counts['canceled_exact_draft']+=any(normalize(t)==normalize(r['reference']) for t in r['overlapping_drafts'])
                continue
            counts['active_total']+=1
            counts['active_exact']+=r['exact']
            counts['active_exact_and_covered']+=(r['exact'] and not r['uncertain'])
            counts['active_covered']+=not r['uncertain']
            if r['transition']=='invalid':
                counts['written_error_total']+=1
                counts['written_error_exact']+=r['exact']
            if s:=r['sign_side']:
                counts[s+'_sign_total']+=1
                if r['candidate'] is not None:
                    orig=normalize(r['reference']); observed=normalize(r['candidate'])
                    i=orig.index('-')
                    counts[s+'_sign_only_dropped']+=observed==orig[:i]+orig[i+1:]
    return dict(counts)


if __name__=='__main__':
    print(json.dumps(run(),indent=2))
