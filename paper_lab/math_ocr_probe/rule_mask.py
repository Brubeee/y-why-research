"""Research-only suppression of long scan rules in the proposal mask."""
import numpy as np
from scipy import ndimage as ndi


def striped_proposals(mask, unit=1):
    """Find long shallow ink ridges without painting the image OCR will read."""
    h, w = mask.shape
    if min(h,w) < 90:
        return mask.copy()
    work = mask.copy()
    reject = np.zeros_like(mask)
    xcenter = np.arange(w) - (w-1)/2
    # Reject only near-horizontal structures stretching across most of a page.
    # At width 640, an adjacent slope bin moves the endpoint by about 1 px.
    slopes = np.linspace(-.045, .045, 31)
    delta = np.rint(slopes[:, None]*xcenter).astype(int)
    band = max(2, round(2*unit))
    minimum = .48*w
    protected = ndi.uniform_filter1d(mask.astype(float), 2*round(8*unit)+1, axis=0) >= .58
    for _ in range(min(32, h//12)):
        ys,xs = work.nonzero()
        if not len(xs):
            break
        best = None
        for i, shift in enumerate(delta):
            intercepts = np.clip(ys - shift[xs] + band, 0, h+2*band-1)
            # Count distinct columns, not repeated pixels from tall glyphs.
            evidence = np.zeros((h+2*band,w), dtype=bool)
            evidence[intercepts,xs] = True
            counts = ndi.maximum_filter1d(evidence,2*band+1,axis=0).sum(axis=1)
            j = int(counts.argmax())
            if counts[j] < minimum or (best is not None and counts[j] <= best[0]):
                continue
            occupied = np.flatnonzero(evidence[max(0,j-band):j+band+1].any(axis=0))
            if occupied[-1] - occupied[0] < .69*w:
                continue
            best = (counts[j], i, j-band)
        if best is None:
            break
        _, i, center = best
        along = abs(np.arange(h)[:,None] - delta[i][None,:] - center) <= band
        # Preserve glyph intersections where substantial vertical evidence exists
        # above and below the strip. Other cuts affect proposals only.
        reject |= along & ~protected
        work &= ~along
    return mask & ~reject
