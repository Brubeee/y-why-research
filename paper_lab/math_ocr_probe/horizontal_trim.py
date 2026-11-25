"""Narrow line apertures without changing vertical grouping or source pixels."""
import numpy as np
from scipy import ndimage as ndi


def repair_horizontal_apertures(photo, boxes):
    """Take (raw_box, padded_box) pairs, preserving rows, order and y bounds.

    Long ruled strokes have shallow column support. Use taller ink to seed a
    tighter proposal, then reserve a glyph-width margin for edge punctuation.
    When support is inadequate, leave the existing box intact.
    """
    if not boxes:
        return []
    gray = np.asarray(photo.convert('L'), dtype=np.float32)
    h, w = gray.shape
    unit = max(1, min(h, w) / 365)
    background = ndi.maximum_filter(gray, size=2 * int(13 * unit) + 1)
    mask = background - gray > 45
    out = []
    for box, padded in boxes:
        l, t, r, b = box
        pl, pt, pr, pb = padded
        if r-l <= .55*w:
            out.append((box, padded))
            continue
        # A shallow stroke or isolated tall column should not seed an aperture.
        column = (mask[t:b, l:r].sum(axis=0) >= round(7 * unit)).astype(np.int16)
        seed_window = max(3, 2 * round(3 * unit) + 1)
        core = np.flatnonzero(ndi.convolve1d(column, np.ones(seed_window, dtype=np.int16),
                                              mode='constant') >= round(4 * unit))
        if len(core) < round(12 * unit):
            out.append((box, padded))
            continue
        # Allow space for a leading minus or trailing bracket even where they
        # failed the persistence threshold. Do not select by OCR text.
        fringe = round(28 * unit)
        nl = max(l, l + int(core[0]) - fringe)
        nr = min(r, l + int(core[-1]) + fringe + 1)
        if nr-nl >= .85*(r-l):
            out.append((box, padded))
            continue
        out.append(((nl, t, nr, b), (max(pl, nl-round(12*unit)), pt, min(pr, nr+round(12*unit)), pb)))
    return out
