import { verifyRows, parseExpression } from './verify.mjs';
import { diagnoseStep, interpretProbe } from './diagnostic.mjs';

import { gradeExpansion } from './expansion_form.mjs';
import { createDelayedReview, REVIEW_KEY } from './delayed_review.mjs';
import { RETRY_TASK, createRetry, exposeRetryHint, recordRetry } from './memex.mjs';
import { validateCrop, mapOcrBoxes, encodeImageCrop } from './crop.mjs';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  if (cls) item.className = cls;
  return item;
};
const delayedReview = createDelayedReview({store:() => window.localStorage});
const MAX_BYTES = 6 * 1024 ** 2;
const MAX_ROWS = 45;
const courses = {
  cbse: { tag: 'Suggested skill: Algebra · one-variable linear equations. Grade 8 reference; confirm against your school’s edition.', label: 'NCERT Grade 8 Mathematics bridge programme', url: 'https://www.ncert.nic.in/pdf/Bridge_Programme/Grade8/Bridge_Programme-Mathematics-Grade_8.pdf' },
  myp: { tag: 'Suggested IB MYP strand: Algebra. No school-year sequence or chapter is inferred.', label: 'IB MYP mathematics framework', url: 'https://www.ibo.org/programmes/middle-years-programme/curriculum/mathematics/' },
  other: { tag: 'No board or chapter match. The checker still supports a limited linear equation grammar.' },
};
let rows = [], objectUrl, dims, inflight, revision = 0, draftRevision = 0, diagnosis = null, skillMatch = null;
let currentFile = null, region = null, selecting = false, corner = null, retrySession = null;
const clearAttestation = () => { $('anchor-check').checked = false; };
function regionButtons() {
  const img = $('image');
  const compatible = !!currentFile && !!dims && img.naturalWidth === dims.width && img.naturalHeight === dims.height;
  $('select-region').disabled = !compatible;
  $('read-region').disabled = !compatible || !region || selecting;
}
function clearRegion() {
  selecting = false; corner = null; region = null;
  $('region').hidden = true;
  $('photo-view').classList?.remove('selecting');
  $('region-help').hidden = true;
  regionButtons();
}

function status(text) { $('scan-status').textContent = text; }
function resetResult(message = 'Run the check on your selected, confirmed lines.') {
  draftRevision++;
  diagnosis = null;
  skillMatch = null; course();
  $('verdict').replaceChildren(el('p', message));
  $('probe').hidden = true;
  $('answer').value = '';
  $('probe-result').replaceChildren();
  $('retry').hidden = true;
  $('retry-answer').value = '';
  showDelayed();
}
function overlay(id, box) {
  $(id).hidden = true;
  const img = $('image');
  if (!box || !dims?.width || !dims?.height || img.naturalWidth !== dims.width || img.naturalHeight !== dims.height) return;
  for (const [key, unit, value] of [['left','width',box.x],['top','height',box.y],['width','width',box.width],['height','height',box.height]]) {
    $(id).style[key] = (100 * value / dims[unit]) + '%';
  }
  $(id).hidden = false;
}
const updateCrop = box => overlay('crop',box);
function canMarkCrossedOut(index) {
  const row = rows[index], img = $('image');
  if (!currentFile || idxOutsideInterior(index) || !row?.box || row.selected || row.confirmed ||
      !dims || img.naturalWidth !== dims.width || img.naturalHeight !== dims.height) return false;
  const {y,height} = row.box;
  return !rows.some((other,i) => i !== index && other.box &&
    y < other.box.y + other.box.height && other.box.y < y + height);
}
const idxOutsideInterior = i => i <= 0 || i >= rows.length - 1;

let syncPhotoDispositions = [];
function renderRows() {
  syncPhotoDispositions = [];
  $('rows').replaceChildren();
  $('add').disabled = rows.length >= MAX_ROWS;
  for (const [i, row] of rows.entries()) {
    const box = el('div', '', 'row'), select = el('input'), field = el('input'), confirm = el('input');
    select.type = 'checkbox'; select.checked = row.selected;
    select.setAttribute('aria-label', 'Include line ' + (i + 1));
    field.type = 'text'; field.maxLength = 180; field.value = row.text; field.autocomplete = 'off';
    field.setAttribute('aria-label', 'Line ' + (i + 1) + ' transcription');
    confirm.type = 'checkbox'; confirm.checked = row.confirmed; confirm.disabled = !row.selected;
    const label = el('label', '', 'confirm');
    label.append(confirm, document.createTextNode(' I confirm the transcription of line ' + (i + 1)));
    let crossedOut;
    function syncDisposition() {
      if (!crossedOut) return;
      crossedOut.checked = !!row.crossedOut;
      crossedOut.disabled = !canMarkCrossedOut(i);
    }
    select.addEventListener('change', () => {
      row.selected = select.checked; confirm.disabled = !row.selected;
      row.crossedOut = false;
      row.confirmed = confirm.checked = false;
      syncDisposition();
      clearAttestation();
      resetResult();
    });
    confirm.addEventListener('change', () => { row.confirmed = confirm.checked; resetResult(); });
    field.addEventListener('input', () => {
      row.text = field.value; row.confirmed = confirm.checked = false; row.crossedOut = false;
      syncDisposition(); clearAttestation(); resetResult();
    });
    field.addEventListener('focus', () => updateCrop(row.box));
    box.append(select, field, label);
    if (currentFile && row.box && !idxOutsideInterior(i)) {
      crossedOut = el('input');
      crossedOut.type = 'checkbox';
      const disposition = el('label', '', 'confirm');
      disposition.append(crossedOut, document.createTextNode(' Line ' + (i+1) +
        ': the entire highlighted row is crossed out on the photo and contains no active work.'));
      crossedOut.addEventListener('focus', () => updateCrop(row.box));
      crossedOut.addEventListener('change', () => {
        updateCrop(row.box);
        row.crossedOut = crossedOut.checked && canMarkCrossedOut(i) && !$('crop').hidden;
        syncDisposition();
        clearAttestation();
        resetResult();
      });
      syncDisposition();
      syncPhotoDispositions.push(syncDisposition);
      box.append(disposition);
    }
    $('rows').append(box);
  }
}
function add(text = '', selected = true) { if (rows.length < MAX_ROWS) rows.push({text,selected,confirmed:false}); }
function clearPhoto() {
  inflight?.abort(); inflight = null; revision++;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null; dims = null; currentFile = null; clearRegion(); clearAttestation();
  $('region-tools').hidden = true; $('anchor-control').hidden = true;
  $('image').removeAttribute('src'); $('photo-view').hidden = true; $('crop').hidden = true; $('photo').value = '';
}
$('clear').addEventListener('click', () => {
  clearPhoto(); rows = []; add(); add(); renderRows(); resetResult();
  status('No photo loaded. OCR drafts are never treated as verified maths.');
});
$('example').addEventListener('click', () => {
  clearPhoto(); rows = [];
  for (const t of ['−(x−4)=12', '−x−4=12', 'x=−16']) add(t);
  renderRows(); resetResult();
  status('A typed, synthetic example. Review and confirm each line before checking.');
});
$('add').addEventListener('click', () => { add(); renderRows(); clearAttestation(); resetResult(); $('rows').lastElementChild?.querySelector('input[type=text]').focus(); });
async function readDraft(target = null) {
  if (!currentFile) return;
  inflight?.abort();
  const owner = new AbortController();
  inflight = owner;
  const current = ++revision, source = currentFile, draft = draftRevision;
  const imageSize = dims && {...dims}, requested = target && {...target};
  const latest = () => current === revision && source === currentFile;
  const applicable = () => {
    if (!latest()) return false;
    if (draft === draftRevision) return true;
    status('Kept your current work. The earlier reread was not applied.');
    return false;
  };
  status('Reading ' + (requested ? 'the selected area' : 'the full photo') + ' on the local host. Your current work stays in place for now.');
  try {
    let file = source, cropped = null;
    if (requested) {
      cropped = await encodeImageCrop($('image'), requested, imageSize);
      if (!applicable()) return;
      file = cropped.blob;
    }
    const r = await fetch('/api/ocr', {method:'POST',headers:{'Content-Type':file.type},body:file,signal:owner.signal});
    if (!applicable()) return;
    let data = await r.json();
    if (!applicable()) return;
    if (!r.ok) throw new Error(data?.error || 'OCR could not read this photo.');
    if (data?.status !== 'draft' || !Array.isArray(data.lines)) throw new Error('The OCR response was not usable.');
    if (cropped) data = mapOcrBoxes(data, cropped.rect, imageSize, cropped);
    const nextSize = data.image;
    if (!nextSize || !['width','height'].every(k => Number.isSafeInteger(nextSize[k]) &&
        nextSize[k] > 0 && (!imageSize || nextSize[k] === imageSize[k])))
      throw new Error('OCR returned unexpected photo dimensions.');
    if (!data.lines.length) {
      if (!imageSize && !requested) {
        dims = {...nextSize};
        regionButtons();
      }
      status('No text detected. Kept your current work. Try another area or type the lines.');
      return;
    }
    if (data.lines.some(l => typeof l?.text !== 'string' || !l.text.trim()))
      throw new Error('The OCR response contained unusable text.');
    const nextRows = data.lines.slice(0,MAX_ROWS).map(l => ({
      text:l.text.slice(0,180),selected:false,confirmed:false,
      box:cropped || source.type === 'image/png' ? validateCrop(l.box,nextSize) : null,
    }));
    if (!applicable()) return;
    // Commit the replacement only after all fallible encoding/validation.
    dims = {...nextSize};
    rows = nextRows;
    if (!requested) clearRegion();
    updateCrop(null);
    clearAttestation();
    resetResult();
    renderRows();
    regionButtons();
    status('Draft ready: ' + data.lines.length + ' detected lines. ' + (requested ? 'Selected area only. Compare with the full photo to check for missing work. ' : 'Select one question and verify signs, brackets, and reading order. ') + (data.lines.length > MAX_ROWS ? 'Only the first ' + MAX_ROWS + ' lines are shown. Try selecting a smaller area.' : ''));
  } catch (e) {
    if (applicable()) status((e.name === 'AbortError' ? 'OCR cancelled.' : 'OCR draft unavailable. ' + e.message) + ' Kept your current work.');
  } finally {
    if (inflight === owner) inflight = null;
  }
}

$('photo').addEventListener('change', async () => {
  const file = $('photo').files?.[0];
  if (!file) return;
  clearPhoto(); resetResult(); rows = []; add(); add(); renderRows();
  if (!['image/png','image/jpeg'].includes(file.type) || !file.size || file.size > MAX_BYTES) {
    status('Choose a PNG or JPEG no larger than 6 MiB. You can still enter the lines by hand.');
    return;
  }
  currentFile = file;
  objectUrl = URL.createObjectURL(file); $('image').src = objectUrl; $('photo-view').hidden = false;
  $('region-tools').hidden = false; $('anchor-control').hidden = false;
  regionButtons();
  await readDraft();
});
$('image').addEventListener('load', () => { regionButtons(); syncPhotoDispositions.forEach(sync => sync()); });
$('select-region').addEventListener('click', () => {
  if ($('select-region').disabled) return;
  draftRevision++;
  clearRegion(); selecting = true;
  $('photo-view').classList?.add('selecting');
  $('region-help').hidden = false;
  $('region-help').textContent = 'Tap the top-left and bottom-right corners around one question, including the original equation and all active lines.';
  regionButtons();
});
$('image').addEventListener('click', e => {
  if (!selecting || !dims) return;
  const box = $('image').getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return;
  const point = ['width','height'].map((dim, i) => Math.round(dims[dim] * Math.max(0, Math.min(1,
    ((i ? e.clientY : e.clientX) - (i ? box.top : box.left))/box[dim]))));
  if (point.some(x => !Number.isFinite(x))) return;
  draftRevision++;
  if (!corner) {
    corner = point;
    $('region-help').textContent = 'Now tap the opposite corner.';
    return;
  }
  const [x,y] = corner.map((n,i) => Math.min(n,point[i]));
  try {
    region = validateCrop({x,y,width:Math.abs(corner[0]-point[0]),height:Math.abs(corner[1]-point[1])}, dims);
    selecting = false; corner = null;
    $('photo-view').classList?.remove('selecting');
    overlay('region', region);
    $('region-help').textContent = 'Area selected. Reading it will replace the current draft lines. The full photo stays visible.';
  } catch {
    corner = null;
    $('region-help').textContent = 'That area is too small or not readable. Tap two new corners.';
  }
  regionButtons();
});
$('read-region').addEventListener('click', () => { if (!$('read-region').disabled && region) return readDraft(region); });
$('read-full').addEventListener('click', () => readDraft());
$('anchor-check').addEventListener('change', () => resetResult());
$('verify').addEventListener('click', () => {
  resetResult();
  const picked = rows.map((r,i)=>({...r,sourceIndex:i})).filter(r => r.selected);
  if (picked.length < 2 || picked.length > 12) { resetResult('Select between 2 and 12 lines for one question, starting with its original equation.'); return; }
  for (let i=1; i<picked.length; i++) {
    for(let skipped=picked[i-1].sourceIndex+1;skipped<picked[i].sourceIndex;skipped++) {
      if (!rows[skipped].crossedOut || !canMarkCrossedOut(skipped) ||
          !picked[i-1].box || !picked[i].box ||
          picked[i-1].box.y + picked[i-1].box.height > rows[skipped].box.y ||
          rows[skipped].box.y + rows[skipped].box.height > picked[i].box.y) {
        resetResult('Select consecutive active lines. A gap can be skipped only if the entire isolated row is confirmed crossed out on the photo.');
        return;
      }
    }
  }
  const [anchor,...steps] = picked;
  if (currentFile && anchor.confirmed && !$('anchor-check').checked) {
    resetResult('Check the first selected line against the original equation on the full photo, then confirm above that no active step is omitted. No verdict was issued.');
    return;
  }
  const result = verifyRows({anchor,rows:steps});
  const labels = {equivalent:'Same solution set',changed:'First verified change',unsupported:'Cannot check this line',unconfirmed:'Needs transcription confirmation','not-considered':'Not checked'};
  if (result.anchor.status === 'confirmed' && result.anchor.solution?.kind === 'unique') { skillMatch = 'linear'; course(); }
  const out = $('verdict'); out.replaceChildren(el('p','Original equation: ' + anchor.text + '. ' + result.anchor.message));
  if (currentFile) out.append(el('p','Selected steps only. This is not a pass or grade for the whole question.','fine'));
  const skippedLines = rows.map((row,i)=>row.crossedOut && i>anchor.sourceIndex && i<picked.at(-1).sourceIndex ? i+1 : null).filter(Boolean);
  if (skippedLines.length) out.append(el('p', 'Marked crossed out; not checked: line ' + skippedLines.join(', ') + '.', 'fine'));
  result.rows.forEach((r,i) => {
    const p = el('p', 'Line ' + (steps[i].sourceIndex+1) + ' · ' + (labels[r.status] || r.status) + ' · ' + steps[i].text + ' — ' + r.message, 'step-result ' + r.status);
    out.append(p);
  });
  if (!result.rows.some(r => r.status === 'changed')) return;
  const i = result.rows.findIndex(r => r.status === 'changed');
  diagnosis = diagnoseStep(picked[i].text,picked[i+1].text);
  if (diagnosis.status !== 'ambiguous' || !diagnosis.probe) {
    out.append(el('p','The maths changed. This prototype does not have enough evidence to say why.'));
    return;
  }
  skillMatch = 'distribution'; course();
  $('probe').hidden = false;
  $('probe-question').textContent = diagnosis.reason + ' Expand and simplify: ' + diagnosis.probe.input.split('=')[0].replaceAll('-','−') + '.';
  retrySession ??= createRetry({diagnostic:diagnosis});
  if (retrySession) showRetry();
});
$('probe-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!diagnosis?.probe) return;
  const a = $('answer').value.trim(), [expression,rhs] = diagnosis.probe.input.split('=');
  const parts = a.split('=');
  const work = parts.length === 2 && parts[1].trim().replaceAll('−','-') === rhs ? parts[0] : a;
  const form = gradeExpansion(work, expression);
  if (!['expanded','wrong'].includes(form.status)) {
    $('probe-result').replaceChildren(el('p',form.message));
    return;
  }
  const parsed = parseExpression(work);
  const coefficient = parsed.coefficient === '1' ? '' : parsed.coefficient === '-1' ? '-' : parsed.coefficient;
  const canonical = coefficient + parsed.variable + (parsed.constant.startsWith('-') ? '' : '+') + parsed.constant + '=' + rhs;
  const response = interpretProbe(diagnosis, canonical);
  $('probe-result').replaceChildren(el('p',response.reason),el('p',response.followUp || ''));
  if (response.status === 'unresolved') return;
  $('probe-result').append(el('p', 'Exact expansion: ' + diagnosis.probe.correct.split('=')[0].replaceAll('-','−') + '.'));
});
function showRetry() {
  $('retry').hidden = false;
  $('retry-question').textContent = RETRY_TASK.instruction + ' ' + RETRY_TASK.prompt;
  const hasHint = retrySession.hintExposedAt !== null;
  $('retry-hint').disabled = hasHint || retrySession.events.length >= 120;
  $('retry-hint-text').hidden = !hasHint;
  $('retry-hint-text').textContent = hasHint ? RETRY_TASK.hint : '';
  const last = retrySession.lastEvent;
  $('retry-result').textContent = last?.kind === 'attempt' ? last.message : '';
  const first = retrySession.firstParseable, success = retrySession.firstSuccess;
  const firstText = first ? 'First readable response: ' + first.message : 'No readable response yet.';
  const solvedText = success
    ? success.mode === 'hint-aided' ? ' First fully correct response followed a hint.' : ' First fully correct response used no hint for this question.'
    : ' A fully correct response is not recorded yet.';
  $('retry-evidence').textContent = firstText + solvedText + ' This log is for the current page session only.';
  showDelayed();
}
$('retry-hint').addEventListener('click', () => {
  if (!diagnosis?.probe || !retrySession || $('retry').hidden) return;
  retrySession = exposeRetryHint(retrySession);showRetry();
});
$('retry-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!diagnosis?.probe || !retrySession || $('retry').hidden) return;
  retrySession = recordRetry(retrySession,{text:$('retry-answer').value});showRetry();
});

function canSaveReview() {
  return !!diagnosis?.probe && !$('retry').hidden && !!retrySession?.firstSuccess;
}
function showDelayed(state=delayedReview.inspect()) {
  const offer = canSaveReview() && state.status==='empty';
  const ready = state.status==='ready';
  const text = {
    empty: offer ? 'Save a different exercise to try without a hint tomorrow.' : '',
    waiting: state.dueAt ? 'Available after ' + new Date(state.dueAt).toLocaleString() + ' (this device’s clock).' : '',
    ready: state.needsReadable ? 'Enter one readable expression without an equals sign. No response was recorded.' : 'One readable response will be recorded. No hints are shown for this question.',
    complete: {
      correct:'First readable answer: correct and fully simplified.',
      'not-yet':'First readable answer: not equivalent to the original.',
      unfinished:'First readable answer: equivalent but not fully simplified.',
      'outside-supported-form':'First readable answer: outside the form this checker can score.',
    }[state.outcome],
    unavailable:'The saved review couldn’t be read or updated. No result can be confirmed. You can try deleting the saved review.',
  };
  $('delayed').hidden = state.status==='empty' ? !offer : false;
  $('delayed-save').hidden = !offer;
  $('delayed-refresh').hidden = state.status!=='waiting';
  $('delayed-clear').hidden = state.status==='empty';
  $('delayed-status').textContent = text[state.status] || '';
  $('delayed-form').hidden = !ready;
  $('delayed-prompt').textContent = ready ? 'Expand and simplify without an equals sign: ' + state.prompt : '';
  if (!ready) $('delayed-answer').value = '';
}
$('delayed-save').addEventListener('click', () => {
  if (canSaveReview()) showDelayed(delayedReview.optIn({consent:true}));
});
$('delayed-refresh').addEventListener('click', () => showDelayed());
$('delayed-clear').addEventListener('click', () => {
  $('delayed-answer').value = '';
  showDelayed(delayedReview.clear());
});
$('delayed-form').addEventListener('submit', e => {
  e.preventDefault();
  if ($('delayed-form').hidden) return;
  showDelayed(delayedReview.submit($('delayed-answer').value));
});
globalThis.addEventListener?.('focus', () => showDelayed());
globalThis.addEventListener?.('storage', event => {
  if (event.key !== REVIEW_KEY && event.key !== null) return;
  try {
    if (!event.storageArea || event.storageArea !== window.localStorage) return;
  } catch { return; } // Storage can be inaccessible in restricted contexts.
  // Read current state, not the possibly queued event payload. A replaced
  // ready review may look identical, but must not inherit its old draft.
  $('delayed-answer').value = '';
  showDelayed();
});

function course() {
  const c = courses[$('course').value] || courses.other;
  $('curriculum').replaceChildren(document.createTextNode(skillMatch ? c.tag + (skillMatch === 'distribution' ? ' The flagged line is also a candidate for negative distribution practice.' : '') : 'Profile selected. Check a supported linear equation to get a skill suggestion.'));
  if (skillMatch === 'distribution' && c === courses.cbse) {
    const resource = el('a','NCERT Grade 8 · Ganita Prakash Part 1, Ch. 6: We Distribute, Yet Things Multiply');
    resource.href = 'https://ciet.ncert.gov.in/activity/grade8?lang=en';
    resource.rel = 'noreferrer';
    $('curriculum').append(document.createTextNode(' Review resource, not an identification of your paper’s chapter: '),resource);
    return;
  }
  if (c.url) { const a = el('a',c.label); a.href = c.url; a.rel='noreferrer'; $('curriculum').append(document.createTextNode(' '),a); }
}
$('course').addEventListener('change',course);
add(); add(); renderRows(); course(); showDelayed();
