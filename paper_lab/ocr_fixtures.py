#!/usr/bin/env python3
"""Generate deterministic, fully synthetic full-page scans and independent labels.

No OCR, model fitting, actual student work, or network access. Frozen inputs are
scoring-only. Inline and stacked fractions are separate layout cohorts.
"""
from argparse import ArgumentParser
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import random

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit("Fixture generation requires Pillow (tested with Pillow 13).") from exc

W, H = 1100, 1420
INK = (32, 39, 45)
MANIFEST = "manifest.json"

@dataclass(frozen=True)
class Row:
    text: str
    transition: str
    status: str = "active"
    x: int = 130
    y: int | None = None
    stack: tuple[str, str, str, str] | None = None

@dataclass(frozen=True)
class Page:
    id: str
    cohort: str
    condition: str
    layout_cohort: str
    rows: tuple[Row, ...]
    support: str = "bounded_linear"
    angle: float = 0
    grain: bool = False
    jpeg: bool = False
    style: str = "regular"

PAGES = (
    Page("t-valid","dev","printed","single_column",(
        Row("4(t−2)=20","start"), Row("4t−8=20","valid"), Row("4t=28","valid"), Row("t=7","valid"))),
    Page("t-invalid","dev","printed","single_column",(
        Row("4(t−2)=20","start"), Row("4t−2=20","invalid"), Row("4t=22","not_considered"), Row("t=11/2","not_considered"))),
    Page("t-canceled","dev","printed_crossout","single_column",(
        Row("4(t−2)=20","start"), Row("4t−2=20","ignored","canceled"), Row("4t−8=20","valid"),
        Row("4t=28","valid"), Row("t=7","valid"))),
    Page("inline-dev","dev","ruled_print","inline_fraction",(
        Row("z/3 + 1/2 = 5/6","start"), Row("z/3 = 1/3","valid"), Row("z = 1","valid"))),
    Page("fraction-rotated","frozen","rotated_print_recompressed","inline_fraction",(
        Row("q/5 + 1/4 = 13/20","start"), Row("q/5 = 2/5","valid"), Row("q = 2","valid")),
        angle=4,grain=True,jpeg=True),
    Page("linear-photo-like","frozen","slanted_low_contrast_print","single_column",(
        Row("9(m−3)=36","start"), Row("9m−27=36","valid"), Row("9m=9","invalid"), Row("m=1","not_considered")),
        angle=-3,grain=True,style="muted"),
    Page("stacked-fraction","frozen","typeset_vertical_fraction","stacked_fraction",(
        Row("(y+1)/4 = 3/2","start",stack=("y + 1","4","3","2")),
        Row("y+1=6","valid"), Row("y=5","valid")), support="unsupported"),
    Page("two-columns","frozen","printed_two_columns","multi_column",(
        Row("Left exercise","ignored","context",x=110,y=254),
        Row("7u−3=32","start",x=110,y=342), Row("7u=35","valid",x=110,y=447), Row("u=5","valid",x=110,y=552),
        Row("Right exercise","ignored","context",x=617,y=254),
        Row("4v+3=27","start",x=617,y=342), Row("4v=24","valid",x=617,y=447), Row("v=6","valid",x=617,y=552)),
        support="unsupported"),
    Page("cancel-scan","frozen","rotated_recompressed_crossout","single_column",(
        Row("8(r+2)=56","start"), Row("8r+2=56","ignored","canceled"), Row("8r+16=56","valid"),
        Row("8r=40","valid"), Row("r=5","valid")), angle=-2, grain=True,jpeg=True),
    Page("nonlinear","frozen","printed_exponent","single_column",(
        Row("x²−9=0","unsupported"), Row("x=3 or x=−3","unsupported")), support="unsupported"),
)
NOTES = {
    "stacked-fraction":"Normalized mathematical serialization is recorded for reference, but an OCR row assembler must not guess fraction structure.",
    "two-columns":"Two independent solution chains, grouped left then right in this reference. A single-chain verifier must abstain on the whole page until manually separated.",
    "nonlinear":"Visible Unicode superscript is intentionally outside the bounded affine grammar.",
}
FONT_NAMES = {"regular":"DejaVuSansMono.ttf", "heading":"DejaVuSans.ttf"}
@lru_cache(maxsize=12)
def font(face, size):
    try:
        return ImageFont.truetype(FONT_NAMES[face],size)
    except OSError as exc:
        raise RuntimeError("DejaVu Sans and DejaVu Sans Mono TrueType fonts are required.") from exc

def coords(rect):
    x,y,r,b=map(int,rect)
    return dict(x=x,y=y,width=r-x,height=b-y)

def union(rs):
    return min(r[0] for r in rs),min(r[1] for r in rs),max(r[2] for r in rs),max(r[3] for r in rs)

def turned(rect, angle):
    if not angle:
        return rect
    a=math.radians(angle)
    c,s=math.cos(a),math.sin(a)
    points=[(W/2+c*(x-W/2)+s*(y-H/2), H/2-s*(x-W/2)+c*(y-H/2))
            for x in (rect[0],rect[2]) for y in (rect[1],rect[3])]
    return max(0,math.floor(min(x for x,y in points))),max(0,math.floor(min(y for x,y in points))),min(W,math.ceil(max(x for x,y in points))),min(H,math.ceil(max(y for x,y in points)))

def render(page):
    # The pseudo-photo cohort is digitally synthesized; not human writing/photography.
    im=Image.new("RGB",(W,H),(253,251,242))
    draw=ImageDraw.Draw(im)
    if page.grain:
        rng=random.Random("YWHY-v1-"+page.id)
        for y in range(0,H,4):
            for x in range(0,W,4):
                k=min(248,max(198,249-int((x/W)**2*27)+rng.randrange(-7,8)))
                draw.rectangle((x,y,x+3,y+3),fill=(k,min(255,k+1),max(0,k-7)))
    draw.line((94,220,94,1310),fill=(202,158,153),width=2)
    for y in range(298,1350,54):
        draw.line((95,y,1010,y),fill=(198,214,220),width=1)
    fg=(75,82,87) if page.style=="muted" else INK
    labels=[]
    def text_at(x,y,t,f,anchor="lt"):
        draw.text((x,y),t,font=f,fill=fg,anchor=anchor)
        return draw.textbbox((x,y),t,font=f,anchor=anchor)
    header=text_at(125,118,"MATH PRACTICE",font("heading",39))
    labels.append(dict(id=page.id+"-heading",text="MATH PRACTICE",box=coords(turned(header,page.angle)),
                       transition="ignored",status="context"))
    for i,row in enumerate(page.rows):
        x,y=row.x,row.y if row.y is not None else 330+120*i
        f=font("regular",43 if row.status!="context" else 30)
        if row.stack:
            a,b,c,d=row.stack
            pieces=[text_at(x+75,y,a,f,"mt"),text_at(x+75,y+56,b,f,"mt"),
                    text_at(x+184,y+29,"=",f,"mt"),
                    text_at(x+283,y,c,f,"mt"),text_at(x+283,y+56,d,f,"mt")]
            draw.line((x,y+44,x+150,y+44), fill=fg, width=2)
            draw.line((x+249,y+44,x+317,y+44), fill=fg, width=2)
            rect=union(pieces+[(x,y+43,x+318,y+46)])
        else:
            rect=text_at(x,y,row.text,f)
        if row.status=="canceled":
            l,t,r,b=rect
            draw.line((l-4,(t+b)//2+6,r+9,(t+b)//2-6),fill=(88,77,79),width=3)
            draw.line((l-3,(t+b)//2+10,r+4,(t+b)//2-1),fill=(122,98,95),width=2)
            rect=(l-4,t,r+10,b)
        label=dict(id=f"{page.id}-row-{i+1:02}",text=row.text,box=coords(turned(rect,page.angle)),
                   status=row.status,transition=row.transition)
        if row.stack:
            label["literal_lines"]=[f"{a}    {c}","fraction bars separated by equals",f"{b}    {d}"]
        labels.append(label)
    if page.angle:
        im=im.rotate(page.angle,resample=Image.Resampling.BICUBIC,expand=False,fillcolor=(218,225,228))
    return im,labels

def generate(out, cohort="all"):
    if cohort not in ("all","dev","frozen"):
        raise ValueError("Choose all, dev, or frozen.")
    out=Path(out)
    out.mkdir(parents=True,exist_ok=True)
    data={"version":1,"synthetic":True,"notes":"All pages are generated typeset or digitally degraded fixtures, not handwriting or real student pages. Frozen data is for evaluation, never recognizer tuning. Boxes are upright raster-coordinate envelopes; transition validity is defined only within recorded chains.","pages":[]}
    for page in PAGES:
        if cohort!="all" and cohort!=page.cohort:
            continue
        image,rows=render(page)
        filename=page.id+(".jpg" if page.jpeg else ".png")
        kw={"quality":72,"optimize":False,"subsampling":2} if page.jpeg else {"compress_level":7}
        image.save(out/filename,**kw)
        bad=next((r["id"] for r in rows if r["status"]=="active" and r["transition"]=="invalid"),None)
        data["pages"].append(dict(id=page.id,image=filename,width=W,height=H,cohort=page.cohort,
            condition=page.condition,layout_cohort=page.layout_cohort,support=page.support,
            rows=rows,first_invalid_row_id=bad,notes=NOTES.get(page.id,"")))
    (out/MANIFEST).write_text(json.dumps(data,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    return data

def _self_test():
    with TemporaryDirectory() as a, TemporaryDirectory() as b:
        report=generate(a)
        assert generate(b)==report
        assert len({p["id"] for p in report["pages"]}) == len(PAGES)
        for p in report["pages"]:
            assert (Path(a)/p["image"]).read_bytes()==(Path(b)/p["image"]).read_bytes()
            assert len({r["id"] for r in p["rows"]})==len(p["rows"])
            for r in p["rows"]:
                box=r["box"]
                assert 0<=box["x"]<box["x"]+box["width"]<=W and 0<=box["y"]<box["y"]+box["height"]<=H
            if p["first_invalid_row_id"]:
                r=next(r for r in p["rows"] if r["id"]==p["first_invalid_row_id"])
                assert r["status"]=="active" and r["transition"]=="invalid"
    print("Fixture generation, bounds, identifiers, and same-environment byte determinism passed. No OCR was run.")

if __name__=="__main__":
    ap=ArgumentParser(description=__doc__)
    ap.add_argument("--out",type=Path)
    ap.add_argument("--cohort",choices=("all","dev","frozen"),default="all")
    ap.add_argument("--self-test",action="store_true")
    args=ap.parse_args()
    if args.self_test:
        _self_test()
    if args.out:
        r=generate(args.out,args.cohort)
        print(f"Generated {len(r['pages'])} synthetic pages with {args.out/MANIFEST}.")
    if not args.out and not args.self_test:
        ap.error("Specify --out and/or --self-test.")
