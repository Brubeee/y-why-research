#!/usr/bin/env python3
"""Compare full-page vs predefined question crops, using real local Tesseract PSM 3.

Synthetic, annotation-assisted evaluation: regions and row boxes are known from
layout authoring, not picked by users or inferred from OCR. Never grades work.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw
from ocr_bench import score_page, totals, verdict_for, CONFIDENCE_THRESHOLD, HERE
from ocr_fixtures import font
from ocr_server import draft_ocr

# Regions are predeclared general problem areas in source pixel coordinates.
# The sentinel has *one image*; its second crop intentionally omits the anchor.
PAGE_SIZE = (1380, 1480)
CASES = {
    'negative-distribution': {
        'condition': 'faint unary minus and invalid distribution',
        'groups': [[('−(x−4)=12', 'start'), ('−x−4=12', 'invalid'), ('x=−16', 'not_considered')]],
        'faint': (0,0),
        'areas': {'question': (90, 285, 690, 690), 'clipped_anchor': (90, 442, 690, 690)},
    },
    'canceled-complete': {
        'condition': 'printed strike-through and corrected row',
        'groups': [[('6(s+2)=30', 'start'), ('6s+2=30', 'canceled'), ('6s+12=30', 'valid'), ('6s=18', 'valid'), ('s=3', 'valid')]],
        'areas': {'question': (90, 285, 690, 915)},
    },
    'parallel-exercises': {
        'condition': 'two independent exercises in columns; selected left question only',
        'groups': [[('3v−2=10', 'start'), ('3v=12', 'valid'), ('v=4', 'valid')],
                   [('2w+5=13', 'start'), ('2w=8', 'valid'), ('w=4', 'valid')]],
        'areas': {'question': (80, 285, 650, 700)},
    },
    'fraction-clean': {
        'condition': 'printed fraction and exact linear chain',
        'groups': [[('k/3 + 1/2 = 5/6', 'start'), ('k/3 = 1/3','valid'), ('k = 1','valid')]],
        'areas': {'question': (90, 276, 700, 700)},
    },
}

# These deliberately edited transcripts test the metric, not OCR accuracy.
LITERAL_CONTROLS = [
    {'id':'literal-anchor-sign-loss-hides-error','reference':['−(x−4)=12','−x−4=12','x=−16'],
     'observed':['−(x+4)=12','−x−4=12','x=−16'],'expect':'changed'},
    {'id':'literal-sign-loss-invents-error','reference':['−(x−4)=12','−x+4=12','x=−8'],
     'observed':['−(x−4)=12','−x−4=12','x=−8'],'expect':'ok'},
    {'id':'literal-original-anchor-absent','reference':['−(x−4)=12','−x−4=12','x=−16'],
     'observed':[None,'−x−4=12','x=−16'],'expect':'changed'},
    {'id':'literal-unsafe-survivor-promoted','reference':['−x−4=12','x=−16'],
     'observed':['−x−4=12','x=−16'],'expect':'ok'},
]


def box(rect):
    x, y, xx, yy = rect
    return dict(x=x, y=y, width=xx-x, height=yy-y)


def render(case, spec):
    im = Image.new('RGB', PAGE_SIZE, (251, 248, 240))
    d = ImageDraw.Draw(im)
    heading = font('heading', 50)
    sub = font('heading', 31)
    math = font('regular', 48)
    d.text((100, 108), 'Practice sheet', font=heading, fill=(36, 44, 50))
    d.text((100, 193), 'Solve each exercise; show your working.', font=sub, fill=(57, 65, 70))
    d.line((90, 260, 1290, 260), fill=(161, 160, 155), width=2)
    d.text((100, 1260), 'Check the original equation before you finish.', font=sub, fill=(57, 65, 70))
    rows = []
    for g, group in enumerate(spec['groups']):
        x = (128, 774)[g]
        for i, (literal, kind) in enumerate(group):
            y = 346 + i * 115
            d.text((x, y), literal, fill=(27, 34, 38), font=math, anchor='lt')
            region = d.textbbox((x, y), literal, font=math, anchor='lt')
            if (g, i) == spec.get('faint'):
                glyph = literal[0]
                width = int(d.textlength(glyph, font=math))
                d.rectangle((x - 1, y - 1, x + width - 2, region[3] + 2), fill=(251, 248, 240))
                d.text((x, y + 9), glyph, fill=(172, 170, 164), font=math, anchor='lt')
            if kind == 'canceled':
                l, t, r, b = region
                d.line((l-5, b-11, r+8, t+10), fill=(95, 74, 78), width=4)
                region = (l-5, t, r+9, b)
            if g == 0:  # explicitly labeled target question only
                rows.append(dict(id=f'{case}:{i+1}', text=literal, box=box(region),
                                 status='canceled' if kind=='canceled' else 'active',
                                 transition='ignored' if kind=='canceled' else kind))
    return im, {
        'id': case, 'support': 'bounded_linear', 'layout_cohort': 'multi_column' if len(spec['groups']) > 1 else 'single_column',
        'condition': spec['condition'], 'rows': rows,
    }


def png(im):
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return buf.getvalue()


def translated(lines, x, y):
    def entity(e):
        b = e['box']
        return {**e, 'box': {**b, 'x': b['x']+x, 'y': b['y']+y}}
    return [{**entity(line), 'words': [entity(word) for word in line['words']]} for line in lines]


def literal_report():
    result = subprocess.run(['node',str(HERE/'ocr_verdict.mjs')], input=json.dumps(LITERAL_CONTROLS),
                            text=True, capture_output=True, check=True, timeout=15)
    r = json.loads(result.stdout)
    c = r['cases']
    assert [c[i]['observed']['verdict'] for i in range(len(c))] == ['ok','changed','unresolved','ok']
    assert all(x['referenceMatchesExpected'] for x in c)
    return r


def directed(verdict):
    rows = verdict['cases']
    return {**verdict['counts'],
            'wrong_to_right': sum(c['safetyFlip'] for c in rows),
            'right_to_wrong': sum(c['verdictFlip'] and not c['safetyFlip'] for c in rows)}


def run():
    strategy = {'full': [], 'question_crop': [], 'clipped_anchor_sentinel': []}
    hashes, regions = {}, {}
    clip = None
    for case, spec in CASES.items():
        im,page = render(case,spec)
        raw = png(im)
        hashes[case] = hashlib.sha256(raw).hexdigest()
        full = draft_ocr(raw,'image/png')['lines']
        strategy['full'].append(score_page(page,full))
        regions[case] = {k:list(r) for k,r in spec['areas'].items()}
        for kind,rect in spec['areas'].items():
            extract = draft_ocr(png(im.crop(rect)),'image/png')['lines']
            lines = translated(extract,rect[0],rect[1])
            if kind == 'question':
                strategy['question_crop'].append(score_page(page,lines))
            else:
                clip = score_page(page,lines)
                strategy['clipped_anchor_sentinel'].append(clip)
    results = {}
    for name,pages in strategy.items():
        gated=verdict_for(pages); ungated=verdict_for(pages,gate_confidence=False)
        assert not gated['counts']['referenceMismatch'] and not ungated['counts']['referenceMismatch']
        results[name] = {'totals':totals(pages), 'gated':directed(gated), 'ungated':directed(ungated),
                         'gated_cases':gated['cases'], 'ungated_cases':ungated['cases'], 'pages':pages}
    active = [row for row in clip['rows'] if row['status']=='active']
    anchor, suffix = active[0], active[1:]
    # Compare actual OCR suffix as an intentionally unsafe counterfactual;
    # coverage is reported separately and never changes expected anchor status.
    cmd=['node',str(HERE/'ocr_verdict.mjs')]
    synthetic_input = [{'id':'ocr-suffix-naively-promoted','reference':[r['reference'] for r in suffix],
                         'observed':[r['candidate'] for r in suffix], 'expect':'ok'}]
    suffix_result = json.loads(subprocess.run(cmd,input=json.dumps(synthetic_input),capture_output=True,
                                             text=True,check=True,timeout=15).stdout)['cases'][0]
    return {
        'protocol': 'fixed-question-crop-v1',
        'synthetic': True,
        'warning': 'Annotation-guided region/row stand-ins; not interactive crop performance, not handwritten evidence, and not grading authority.',
        'regions_source_xyxy': regions,
        'source_png_sha256': hashes,
        'tesseract': subprocess.check_output(['tesseract','--version'],text=True).splitlines()[0],
        'word_confidence_threshold':CONFIDENCE_THRESHOLD,
        'strategies':results,
        'missing_anchor_safety': {
            'original_anchor_missing_in_clipped_candidate':anchor['candidate'] is None,
            'anchor_aware_clipped_verdict':results['clipped_anchor_sentinel']['ungated_cases'][0]['observed']['verdict'],
            'naive_ocr_suffix_verdict':suffix_result['observed']['verdict'],
            'ocr_missing_anchor_false_pass':anchor['candidate'] is None and suffix_result['observed']['verdict']=='ok',
            'literal_missing_anchor_false_pass_if_promoted':True,
            'warning':'The clipped crop is a stress sentinel, not a second sample. A suffix pass cannot verify the omitted original equation.',
        },
        'literal_controls':literal_report(),
    }


if __name__ == '__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--json', type=Path)
    args=ap.parse_args()
    report=json.dumps(run(),ensure_ascii=False,indent=2)+'\n'
    if args.json:
        args.json.write_text(report,encoding='utf-8')
    else:
        print(report,end='')
