#!/usr/bin/env python3
"""Offline, synthetic OCR comparison. Never called by the app or used to mark work."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

import PIL
from ocr_fixtures import generate
from ocr_server import draft_ocr, parse_tsv

HERE = Path(__file__).resolve().parent
CONFIDENCE_THRESHOLD = 70  # Fixed engineering cutoff, not a calibrated probability.


def normalize(text):
    # Whitespace and typographic minus only; never repair digits, symbols, or steps.
    return re.sub(r'(?<!\d)\s+|\s+(?!\d)', '', text.strip().replace('−', '-'))


def overlap(line, region):
    """Fraction of candidate OCR line inside the annotated row rectangle."""
    lx, ly, lw, lh = (line[k] for k in ('x', 'y', 'width', 'height'))
    rx, ry, rw, rh = (region[k] for k in ('x', 'y', 'width', 'height'))
    x = max(0, min(lx+lw, rx+rw)-max(lx, rx))
    y = max(0, min(ly+lh, ry+rh)-max(ly, ry))
    return x*y/(lw*lh)


def align(rows, lines):
    """Geometry-only one-to-one matching, not a proposed production row picker."""
    candidates = [[i for i, line in enumerate(lines) if overlap(line['box'], row['box']) >= .50]
                  for row in rows]
    links = {}
    for row, options in zip(rows, candidates):
        if len(options) != 1:
            continue  # fragments or ambiguity are not silently combined
        idx = options[0]
        if sum(idx in indexes for indexes in candidates) == 1:
            links[row['id']] = idx
    return links


def score_page(page, lines):
    links = align(page['rows'], lines)
    result = []
    for row in page['rows']:
        i = links.get(row['id'])
        evidence = lines[i] if i is not None else None
        literal = evidence['text'] if evidence else None
        confidences = [word['confidence'] for word in evidence['words']] if evidence else []
        uncertain = not confidences or any(x is None or x < CONFIDENCE_THRESHOLD for x in confidences)
        result.append({
            'id': row['id'], 'status': row['status'], 'transition': row['transition'],
            'reference': row['text'], 'candidate': literal, 'index': i,
            'exact': literal is not None and normalize(literal) == normalize(row['text']),
            'uncertain': uncertain,
        })
    active = [row for row in result if row['status'] == 'active']
    indexes = [row['index'] for row in active]
    found_in_order = bool(indexes) and None not in indexes and indexes == sorted(indexes)
    # The annotated heading and canceled ink are the only scope exclusions in
    # these fixtures. Never hide an unmatched line based on its recognized text.
    # Require whole-box containment to avoid excluding a mixed/merged row.
    excluded = {
        i for i, line in enumerate(lines)
        if any(row['status'] in ('context', 'canceled') and overlap(line['box'], row['box']) == 1
               for row in page['rows'])
        and not any(row['status'] == 'active' and overlap(line['box'], row['box']) > 0
                    for row in page['rows'])
    }
    in_scope = [i for i in range(len(lines)) if i not in excluded]
    exact_chain = (
        found_in_order and indexes == in_scope and all(row['exact'] for row in active)
        if page['support'] == 'bounded_linear' else None
    )
    # This naive strategy is a cautionary comparison, not a release feature:
    # treat all matched work rows as active without checking crossed-out ink.
    crossed_out_in_naive_selection = sum(row['status'] == 'canceled' and row['index'] is not None
                                        for row in result)
    return {
        'id': page['id'], 'support': page['support'], 'layout_cohort': page['layout_cohort'],
        'condition': page['condition'], 'rows': result,
        'all_active_found_in_order': found_in_order,
        'raw_chain_exact': exact_chain,
        'raw_lines': [{**line, 'out_of_scope':i in excluded} for i, line in enumerate(lines)],
        'unmatched_in_scope_indexes': [i for i in in_scope if i not in indexes],
        'unmatched_ocr_lines': [line['text'] for i, line in enumerate(lines) if i not in links.values()],
        'canceled_rows_in_naive_selection': crossed_out_in_naive_selection,
    }


def compare_candidate(path, page):
    # Fixed experiment: same Tesseract and eng model; permit sparse independent text blocks.
    # PSM 11 does not guarantee document reading order. Score order, never infer it from algebra.
    proc = subprocess.run(
        ['tesseract', str(path), 'stdout', '-l', 'eng', '--psm', '11', 'tsv'],
        check=True, capture_output=True, timeout=20, env={**os.environ, 'OMP_THREAD_LIMIT': '1'},
    )
    return parse_tsv(proc.stdout.decode('utf-8', errors='replace'), page['width'], page['height'])


def verdict_for(pages, *, gate_confidence=True):
    inputs = []
    for page in pages:
        if page['support'] != 'bounded_linear':
            continue
        active = [row for row in page['rows'] if row['status'] == 'active']
        reference = [row['reference'] for row in active]
        expect = 'changed' if any(row['transition'] == 'invalid' for row in active) else 'ok'
        observed = [row['candidate'] if not gate_confidence or not row['uncertain'] else None
                    for row in active]
        # Do not let expected reading order quietly override an actual OCR reorder.
        found = [row['index'] for row in active if row['index'] is not None]
        if found != sorted(found):
            observed = [None] * len(observed)
        inputs.append({'id': page['id'], 'reference': reference, 'observed': observed, 'expect': expect})
    proc = subprocess.run(
        ['node', str(HERE / 'ocr_verdict.mjs')], input=json.dumps(inputs),
        text=True, capture_output=True, timeout=15, check=True,
    )
    return json.loads(proc.stdout)


def totals(pages):
    active = [row for page in pages for row in page['rows'] if row['status'] == 'active']
    covered = [row for row in active if not row['uncertain']]
    return {
        'pages': len(pages), 'active_rows': len(active), 'active_exact': sum(row['exact'] for row in active),
        'active_covered': len(covered), 'active_exact_when_covered': sum(row['exact'] for row in covered),
        'pages_all_active_found_in_order': sum(p['all_active_found_in_order'] for p in pages),
        'pages_raw_chain_eligible': sum(p['raw_chain_exact'] is not None for p in pages),
        'pages_raw_chain_exact': sum(p['raw_chain_exact'] is True for p in pages),
        'canceled_rows': sum(r['status'] == 'canceled' for p in pages for r in p['rows']),
        'canceled_rows_in_naive_selection': sum(p['canceled_rows_in_naive_selection'] for p in pages),
    }


def run(directory, cohort):
    directory = directory.resolve()
    manifest = generate(directory, cohort=cohort)
    if manifest is None:
        manifest = json.loads((directory / 'manifest.json').read_text())
    pages = manifest['pages']
    # Freeze/report source fixtures before either engine runs. No data from the candidate
    # goes into image creation, row matching, labels, or the fixed threshold.
    hashes = {p['id']: hashlib.sha256((directory / p['image']).read_bytes()).hexdigest() for p in pages}
    scores = {'baseline_psm3': [], 'sparse_psm11': []}
    for page in pages:
        path = directory / page['image']
        mime = 'image/png' if path.suffix.lower() == '.png' else 'image/jpeg'
        scores['baseline_psm3'].append(score_page(page, draft_ocr(path.read_bytes(), mime)['lines']))
        scores['sparse_psm11'].append(score_page(page, compare_candidate(path, page)))
    return {
        'protocol_version': 2, 'cohort': cohort, 'synthetic': True,
        'fixture_manifest_sha256': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
        'image_sha256': hashes, 'pillow': PIL.__version__,
        'tesseract': subprocess.check_output(['tesseract', '--version'], text=True).splitlines()[0],
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'min_word_confidence_threshold': CONFIDENCE_THRESHOLD,
        'strategies': {
            name: {'totals': totals(pages), 'verdict_gated': verdict_for(pages),
                   'verdict_ungated': verdict_for(pages, gate_confidence=False), 'pages': pages,
                   'layouts': {key: totals([p for p in pages if p['layout_cohort'] == key])
                               for key in sorted({p['layout_cohort'] for p in pages})}}
            for name, pages in scores.items()
        },
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cohort', choices=('dev', 'frozen'), default='frozen')
    p.add_argument('--json', type=Path, help='Optional output file; otherwise print the full report.')
    args = p.parse_args()
    if not all(shutil.which(x) for x in ('node', 'tesseract')):
        p.error('Node and Tesseract with English data are required')
    with TemporaryDirectory(prefix='ywhy-fixtures-') as temp:
        rendered = json.dumps(run(Path(temp), args.cohort), indent=2, ensure_ascii=False) + '\n'
    if args.json:
        args.json.write_text(rendered, encoding='utf-8')
    else:
        print(rendered, end='')


if __name__ == '__main__':
    main()
