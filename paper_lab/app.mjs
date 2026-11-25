import { findEquationWitness, verifyRows, parseExpression } from './verify.mjs';
import { checkOperationClaim, checkTwoSidedOperationClaim, formatOperationExpression } from './operation_claim.mjs';
import { diagnoseStep, interpretProbe } from './diagnostic.mjs';

import { curriculumReference } from './curriculum.mjs';
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
let rows = [], objectUrl, dims, inflight, revision = 0, draftRevision = 0, chainRevision = 0, diagnosis = null, skillMatch = null;
let currentFile = null, region = null, selecting = false, corner = null, retrySession = null;
let currentProbe = null, firstSeparator = null, photoCandidate = null, typedWorkflow = false, currentActionContext = null;
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
function resetResult(message = 'Run the check on your selected, confirmed lines.', advanceChain = true) {
  draftRevision++;
  if (advanceChain) {
    chainRevision++;
    if (firstSeparator) firstSeparator = { closed:true };
    retrySession = null;
    $('retry-hint-text').hidden = true;
    $('retry-hint-text').textContent = '';
    $('retry-result').textContent = '';
    $('retry-evidence').textContent = '';
  }
  diagnosis = null; currentProbe = null;
  currentActionContext = null;
  skillMatch = null; course();
  $('verdict').replaceChildren(el('p', message));
  $('probe').hidden = true; $('probe-form').hidden = true; $('probe-skip').hidden = true;
  $('operation-claim-panel').hidden = true;
  $('operation-feedback').textContent = '';
  $('operation-kind').value = '';
  $('operation-constant').value = '';
  $('operation-constant').disabled = true;
  $('operation-constant-field').hidden = true;
  $('answer').value = '';
  $('probe-result').replaceChildren();
  $('retry').hidden = true;
  $('retry-answer').value = '';
  showDelayed();
}
function resetTypedEntry(clearText = true) {
  typedWorkflow = false;
  $('typed-work').disabled = false;
  $('confirm-typed').hidden = false;
  $('edit-typed').hidden = true;
  if (clearText) $('typed-work').value = '';
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
  const fields = [];
  $('rows').replaceChildren();
  $('add').disabled = rows.length >= MAX_ROWS;
  $('add').textContent = currentFile ? 'Add a missed line at the end' : 'Add a line';
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
    fields.push(field);
    if (row.manual) box.append(el('small', 'Typed from photo; no detected highlight.', 'manual-source'));
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
    if (currentFile) {
      const insert = el('button','Insert line above','insert-line');
      insert.type = 'button';
      insert.disabled = rows.length >= MAX_ROWS;
      insert.setAttribute('aria-label','Insert a missed line above line ' + (i + 1));
      insert.addEventListener('click', () => {
        if (!currentFile || rows[i] !== row || rows.length >= MAX_ROWS) return;
        rows.splice(i, 0, {text:'',selected:true,confirmed:false,manual:true});
        updateCrop(null);
        clearAttestation();
        resetResult();
        renderRows()[i].focus();
      });
      box.append(insert);
    }
    $('rows').append(box);
  }
  return fields;
}
function add(text = '', selected = true, manual = false) {
  if (rows.length < MAX_ROWS) rows.push({text,selected,confirmed:false,manual});
}
function disposePhotoCandidate(owner) {
  if (owner.preview) owner.preview.removeAttribute('src');
  if (owner.url) URL.revokeObjectURL(owner.url);
}
function cancelPhotoCandidate() {
  if (!photoCandidate) return;
  const owner = photoCandidate;
  photoCandidate = null;
  owner.abort.abort();
  disposePhotoCandidate(owner);
  owner.preview = null; owner.url = null;
}
function clearPhoto() {
  cancelPhotoCandidate();
  inflight?.abort(); inflight = null; revision++;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null; dims = null; currentFile = null; clearRegion(); clearAttestation();
  $('region-tools').hidden = true; $('anchor-control').hidden = true;
  $('image').removeAttribute('src'); $('photo-view').hidden = true; $('crop').hidden = true; $('photo').value = '';
}
$('clear').addEventListener('click', () => {
  resetTypedEntry();
  clearPhoto(); rows = []; add(); add(); renderRows(); resetResult();
  status('No photo loaded. OCR drafts are never treated as verified maths.');
});
$('example').addEventListener('click', () => {
  resetTypedEntry();
  clearPhoto(); rows = [];
  for (const t of ['−(x−4)=12', '−x−4=12', 'x=−16']) add(t);
  renderRows(); resetResult();
  status('A typed, synthetic example. Review and confirm each line before checking.');
});
$('add').addEventListener('click', () => {
  if (rows.length >= MAX_ROWS) return;
  add('', true, !!currentFile);
  updateCrop(null);
  clearAttestation();
  resetResult();
  renderRows().at(-1).focus();
});
function prepareRows(data, imageSize, useBoxes) {
  if (data?.status !== 'draft' || !Array.isArray(data.lines))
    throw new Error('The OCR response was not usable.');
  const size = data.image;
  if (!size || !['width','height'].every(k => Number.isSafeInteger(size[k]) &&
      size[k] > 0 && (!imageSize || size[k] === imageSize[k])))
    throw new Error('OCR returned unexpected photo dimensions.');
  if (data.lines.some(l => typeof l?.text !== 'string' || !l.text.trim()))
    throw new Error('The OCR response contained unusable text.');
  const prepared = data.lines.slice(0,MAX_ROWS).map(l => ({
    text:l.text.slice(0,180),selected:false,confirmed:false,
    box:useBoxes ? validateCrop(l.box,size) : null,
  }));
  return {size,prepared};
}
async function readDraft(target = null) {
  if (!currentFile) return;
  cancelPhotoCandidate();
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
    const {size:nextSize,prepared:nextRows} = prepareRows(data,imageSize,cropped || source.type === 'image/png');
    if (!nextRows.length) {
      if (!imageSize && !requested) {
        dims = {...nextSize};
        regionButtons();
      }
      status('No text detected. Kept your current work. Try another area or type the lines.');
      return;
    }
    if (!applicable()) return;
    // Commit the replacement only after all fallible encoding/validation.
    dims = {...nextSize};
    resetTypedEntry();
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
  if (!['image/png','image/jpeg'].includes(file.type) || !file.size || file.size > MAX_BYTES) {
    $('photo').value = '';
    status('Choose a nonempty PNG or JPEG no larger than 6 MiB.');
    return;
  }
  cancelPhotoCandidate();
  const owner = {abort:new AbortController(), url:null, preview:null};
  photoCandidate = owner;
  const draft = draftRevision;
  const applicable = () => {
    if (photoCandidate !== owner) return false;
    if (draft === draftRevision) return true;
    status('Kept your current work. The selected photo was not applied.');
    return false;
  };
  status('Checking the selected photo on the local host. Your current work stays in place for now.');
  try {
    const result = await fetch('/api/ocr', {method:'POST',headers:{'Content-Type':file.type},body:file,signal:owner.abort.signal});
    if (!applicable()) return;
    const data = await result.json();
    if (!applicable()) return;
    if (!result.ok) {
      const detail = data?.error || 'OCR could not read this photo.';
      const reason = [413,415,422].includes(result.status) ? detail : 'OCR temporarily unavailable. ' + detail;
      $('photo').value='';
      status(reason + ' Photo not replaced. You can try another image or enter lines by hand.');
      return;
    }
    const {size,prepared} = prepareRows(data,null,file.type === 'image/png');
    owner.url = URL.createObjectURL(file);
    owner.preview = document.createElement('img');
    owner.preview.src = owner.url;
    try { await owner.preview.decode(); }
    catch { throw new Error('The photo could not be opened for preview.'); }
    if (!applicable()) return;

    // All validation is complete. Adopt only the still-current candidate;
    // then reset the previous photo and cancel its pending reads once.
    const url = owner.url;
    owner.url = null; photoCandidate = null;
    clearPhoto();
    currentFile = file; objectUrl = url; dims = {...size};
    $('image').src = objectUrl; $('photo-view').hidden = false;
    $('region-tools').hidden = false; $('anchor-control').hidden = false;
    resetTypedEntry();
    rows = prepared;
    if (!rows.length) { add(); add(); }
    resetResult(); renderRows(); regionButtons();
    status(data.lines.length
      ? 'Draft ready: ' + data.lines.length + ' detected lines. Select one question and verify signs, brackets, and reading order. ' + (data.lines.length > MAX_ROWS ? 'Only the first ' + MAX_ROWS + ' lines are shown. Try selecting a smaller area.' : '')
      : 'No text detected in the new photo. Try another area or type the lines.');
  } catch (e) {
    if (applicable()) {
      $('photo').value='';
      status('Photo not replaced. ' + e.message + ' Try again or type the lines.');
    }
  } finally {
    if (photoCandidate === owner) photoCandidate = null;
    disposePhotoCandidate(owner);
  }
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
$('typed-work').addEventListener('input', () => {
  if (!$('typed-work').disabled) resetResult('Typed draft changed. Confirm it again before checking.');
});
$('operation-kind').addEventListener('change', () => {
  const needsConstant = ['add','subtract','multiply','divide'].includes($('operation-kind').value);
  $('operation-constant-field').hidden = !needsConstant;
  $('operation-constant').disabled = !needsConstant;
  if (!needsConstant) $('operation-constant').value = '';
  $('operation-feedback').textContent = '';
});
$('operation-constant').addEventListener('input', () => { $('operation-feedback').textContent = ''; });
$('operation-claim-form').addEventListener('submit', event => {
  event.preventDefault();
  const kind = $('operation-kind').value;
  if (!typedWorkflow || !currentActionContext || currentActionContext.revision !== chainRevision || $('operation-claim-panel').hidden)
    return;
  if (!kind) {
    $('operation-feedback').textContent = 'Choose an operation or Something else / Not sure.';
    return;
  }
  const claim = {kind,constant:$('operation-constant').value.trim()};
  const result = checkTwoSidedOperationClaim({
    before:currentActionContext.before,
    after:currentActionContext.after,
    claim,
  });
  if (result.status === 'consistent') {
    $('operation-feedback').textContent = 'Your declared operation matches both sides exactly. This check does not tell me what you were thinking.';
  } else if (result.status === 'left-mismatch') {
    const expression = formatOperationExpression(currentActionContext.before.text.split('=')[0],claim);
    const word = kind === 'multiply' || kind === 'divide' ? 'Check what happened to every term on the left' : 'Check the left side';
    $('operation-feedback').textContent = `${word} under your declared action: ${expression}. The written left side is ${result.writtenSide}.`;
  } else if (result.status === 'right-mismatch' && result.comparison?.left === true) {
    const expression = formatOperationExpression(currentActionContext.before.text.split('=')[1],claim);
    $('operation-feedback').textContent = `The left side matches your declared action. Check the right side: what is ${expression}? The written right side is ${result.writtenSide}.`;
  } else if (kind === 'other' || result.status === 'abstain') {
    $('operation-feedback').textContent = 'I can’t verify that action from these choices. Add one intermediate equation, or abstain.';
  } else {
    $('operation-feedback').textContent = 'I can’t compare that action exactly. Use a supported exact constant (multiplication and division need a nonzero value), or add one intermediate equation.';
  }
});
$('confirm-typed').addEventListener('click', () => {
  if ($('typed-work').disabled) return;
  const source = $('typed-work').value.trim();
  const lines = source ? source.split(/\r?\n/).map(line => line.trim()) : [];
  if (lines.length < 2 || lines.length > 12 || lines.some(line => !line)) {
    resetResult('Enter 2–12 nonempty equations, one per line, starting with the original equation.');
    return;
  }
  if (lines.some(line => line.length > 180)) {
    resetResult('Keep each typed equation to 180 characters or fewer.');
    return;
  }
  clearPhoto();
  rows = lines.map(text => ({ text, selected:true, confirmed:true }));
  typedWorkflow = true;
  $('typed-work').disabled = true;
  $('confirm-typed').hidden = true;
  $('edit-typed').hidden = false;
  renderRows();
  status('Typed chain confirmed. Checking only the exact lines you entered.');
  resetResult('Typed chain confirmed. Checking only the exact lines you entered.');
  checkSelectedWork();
});
$('edit-typed').addEventListener('click', () => {
  if (!typedWorkflow) return;
  const source = rows.map(row => row.text).join('\n');
  resetResult('Typed draft changed. Confirm it again before checking.');
  typedWorkflow = false;
  rows = []; add(); add(); renderRows();
  $('typed-work').value = source;
  $('typed-work').disabled = false;
  $('confirm-typed').hidden = false;
  $('edit-typed').hidden = true;
  status('Editing the typed draft. Confirm it again before checking.');
});
$('verify').addEventListener('click', checkSelectedWork);
function checkSelectedWork() {
  resetResult(undefined,false);
  const picked = rows.map((r,i)=>({...r,sourceIndex:i})).filter(r => r.selected);
  if (picked.length < 2 || picked.length > 12) { resetResult('Select between 2 and 12 lines for one question, starting with its original equation.'); return; }
  for (let i=1; i<picked.length; i++) {
    for(let skipped=picked[i-1].sourceIndex+1;skipped<picked[i].sourceIndex;skipped++) {
      const skippedRow = rows[skipped];
      if (!skippedRow.crossedOut || !canMarkCrossedOut(skipped)) {
        resetResult('Select consecutive active lines. A gap can be skipped only if the entire isolated row is confirmed crossed out on the photo.');
        return;
      }
      const missing = [picked[i-1], picked[i]].filter(row => !row.box);
      if (missing.length) {
        const line = missing.length === 1 ? 'line ' : 'lines ';
        const labels = missing.map(row => row.sourceIndex + 1).join(' and ');
        const suggestion = !$('select-region').disabled
          ? ' Try Select one question, then Read selected area. A successful reread can replace this draft; check and confirm the new lines again.'
          : '';
        resetResult('I couldn’t locate ' + line + labels + ' in the photo, so I can’t verify where crossed-out line ' + (skipped + 1) +
          ' belongs. No verdict was issued.' + suggestion);
        return;
      }
      if (picked[i-1].box.y + picked[i-1].box.height > skippedRow.box.y ||
          skippedRow.box.y + skippedRow.box.height > picked[i].box.y) {
        resetResult('The photo highlights do not put crossed-out line ' + (skipped + 1) +
          ' between the selected lines. No verdict was issued.');
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
  const anchorMessage = !typedWorkflow || result.anchor.status !== 'confirmed' ? result.anchor.message
    : result.anchor.solution.kind === 'unique' ? 'Confirmed starting equation; its exact solution is not shown.'
    : result.anchor.solution.kind === 'all' ? 'The starting equation is an identity (all real values).'
    : 'The starting equation is a contradiction (no solutions).';
  const out = $('verdict'); out.replaceChildren(el('p','Original equation: ' + anchor.text + '. ' + anchorMessage));
  if (currentFile) out.append(el('p','Selected steps only. This is not a pass or grade for the whole question.','fine'));
  const skippedLines = rows.map((row,i)=>row.crossedOut && i>anchor.sourceIndex && i<picked.at(-1).sourceIndex ? i+1 : null).filter(Boolean);
  if (skippedLines.length) out.append(el('p', 'Marked crossed out; not checked: line ' + skippedLines.join(', ') + '.', 'fine'));
  result.rows.forEach((r,i) => {
    const message = !typedWorkflow ? r.message
      : r.status === 'changed' ? 'This row changes the solution set; no solution is shown.'
      : r.status === 'equivalent' ? 'This row preserves the solution set. That does not verify the reasoning between lines.'
      : r.message;
    const p = el('p', 'Line ' + (steps[i].sourceIndex+1) + ' · ' + (labels[r.status] || r.status) + ' · ' + steps[i].text + ' — ' + message, 'step-result ' + r.status);
    out.append(p);
  });
  // Only an entirely confirmed, equivalent selection receives the optional
  // form check. It never competes with the first-error follow-up.
  if (result.anchor.status === 'confirmed' && result.rows.every(r => r.status === 'equivalent')) {
    for (let i=1; i<picked.length; i++) {
      const before=picked[i-1], after=picked[i];
      const {status}=checkOperationClaim({before,after,claim:'expand-left-only'});
      const wording={
        'fits-written-claim':'The bracket is expanded and simplified, and the right side is unchanged.',
        'unfinished':'The right side is unchanged, but the expansion or arithmetic is not finished.',
        'right-side-rewritten':'The right side was rewritten. That can be a valid combined step, but it is not just a left-side expansion.',
      }[status];
      if (!wording) continue;
      const detail=el('details','','fine');
      detail.append(el('summary','Lines ' + (before.sourceIndex+1) + ' → ' + (after.sourceIndex+1) +
        ': What if I only expanded the left bracket?'),
        el('p',wording + ' The solution set is unchanged; this does not show how you worked it out.'));
      out.append(detail);
    }
  }
  const i = result.rows.findIndex(r => r.status === 'changed');
  if (i < 0) return;
  const before = picked[i], after = picked[i+1];
  const transition = el('section','','first-change');
  transition.append(el('h3','First changed step'));
  const pair = el('div','','transition-pair');
  const beforeCard = el('div','','equation-card');
  beforeCard.append(el('small','Line ' + (before.sourceIndex+1) + ' · exact line before'),el('p',before.text));
  const afterCard = el('div','','equation-card changed');
  afterCard.append(el('small','Line ' + (after.sourceIndex+1) + ' · first verified change'),el('p',after.text));
  pair.append(beforeCard,afterCard);
  transition.append(pair);
  out.append(transition);

  const witness = findEquationWitness(before.text,after.text);
  if (witness.status === 'witness' && witness.before.satisfies !== witness.after.satisfies) {
    const showSubstitution = (text,check) => text.replaceAll(witness.variable,'(' + witness.value + ')') +
      ' → ' + check.left + (check.satisfies ? ' = ' : ' ≠ ') + check.right;
    const proof = el('section','','witness');
    proof.append(el('h3','One exact value to check'),el('p',witness.variable + ' = ' + witness.value));
    proof.append(el('p','Before: ' + showSubstitution(before.text,witness.before)));
    proof.append(el('p','Changed line: ' + showSubstitution(after.text,witness.after)));
    out.append(proof);
  } else if (witness.status === 'abstain') {
    out.append(el('p','No substitution value shown. ' + witness.reason,'fine'));
  } else {
    out.append(el('p','No separately verified substitution value is available for these lines.','fine'));
  }

  currentActionContext = {
    revision:chainRevision,
    before:{text:before.text,confirmed:before.confirmed},
    after:{text:after.text,confirmed:after.confirmed},
  };
  diagnosis = diagnoseStep(before.text,after.text);
  if (diagnosis.status !== 'ambiguous' || !diagnosis.probe) {
    $('probe').hidden = false;
    $('probe-question').textContent = 'What operation did you apply here?';
    if (typedWorkflow) $('operation-claim-panel').hidden = false;
    return;
  }
  skillMatch = 'distribution'; course();
  $('probe').hidden = false;
  $('probe-question').textContent = diagnosis.reason + ' Try a fresh equation and simplify both sides: ' + diagnosis.probe.input.replaceAll('-','−') + '.';
  // Only a currently verified source pair can display the historical response.
  // These ephemeral references are never serialized.
  currentProbe = {
    revision:chainRevision,
    lines:[before,after].map(r => ({row:rows[r.sourceIndex],text:r.text})),
  };
  showSeparator();
}
function showSeparator() {
  const open = !firstSeparator;
  $('probe-form').hidden = !open; $('probe-skip').hidden = !open;
  if (open) return;
  $('probe-question').textContent = 'Separator closed for this page.';
  const prior=firstSeparator;
  const sameRevision = prior.revision === currentProbe.revision && currentProbe.revision === chainRevision;
  const sameSource = Array.isArray(prior.source) && prior.source.every(({row,text},i)=>row===currentProbe.lines[i].row && text===currentProbe.lines[i].text);
  const same = sameRevision && sameSource;
  const out=$('probe-result');
  if (!same) out.replaceChildren(el('p','Related feedback or practice is already available on this page. This separator is closed; no evidence was recorded for this source.'));
  else if (prior.skipped) out.replaceChildren(el('p','Separator skipped. Practice only; no diagnostic evidence was recorded.'));
  else {
    const msg=prior.response;
    out.replaceChildren(el('p','Earlier first response: ' + msg.reason));
    if (msg.status==='unresolved') out.append(el('p','No diagnostic evidence was recorded. Further work is practice only.'));
    else out.append(el('p',msg.followUp || ''),el('p','Exact expansion: ' + prior.exact + '.'));
  }
  if (!same) return;
  retrySession ??= createRetry({diagnostic:diagnosis});
  if (retrySession) showRetry();
}
function awaitingSeparator() {
  return !!currentProbe && currentProbe.revision === chainRevision && !!diagnosis?.probe && !firstSeparator && !$('probe').hidden && !$('probe-form').hidden;
}
$('probe-skip').addEventListener('click', () => {
  if (!awaitingSeparator() || $('probe-skip').hidden) return;
  firstSeparator={skipped:true,source:currentProbe.lines,revision:currentProbe.revision};
  $('answer').value='';
  showSeparator();
});
$('probe-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!awaitingSeparator()) return;
  const a = $('answer').value.trim(), [expression,rhs] = diagnosis.probe.input.split('=');
  const parts = a.split('=');
  const work = parts.length === 2 && parts[1].trim().replaceAll('−','-') === rhs ? parts[0] : a;
  const form = gradeExpansion(work, expression);
  if (!['expanded','wrong'].includes(form.status)) {
    $('probe-result').replaceChildren(el('p','Enter a simplified variable term and an integer constant, or skip to practice. No response was recorded.'));
    return;
  }
  const parsed = parseExpression(work);
  const coefficient = parsed.coefficient === '1' ? '' : parsed.coefficient === '-1' ? '-' : parsed.coefficient;
  const canonical = coefficient + parsed.variable + (parsed.constant.startsWith('-') ? '' : '+') + parsed.constant + '=' + rhs;
  const response = interpretProbe(diagnosis, canonical);
  firstSeparator={source:currentProbe.lines,revision:currentProbe.revision,response,exact:diagnosis.probe.correct.split('=')[0].replaceAll('-','−')};
  $('answer').value='';
  showSeparator();
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
  if (!currentProbe || currentProbe.revision !== chainRevision || !firstSeparator || !diagnosis?.probe || !retrySession || $('retry').hidden) return;
  retrySession = exposeRetryHint(retrySession);showRetry();
});
$('retry-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!currentProbe || currentProbe.revision !== chainRevision || !firstSeparator || !diagnosis?.probe || !retrySession || $('retry').hidden) return;
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
  const { text, reference } = curriculumReference($('course').value,skillMatch);
  const out = $('curriculum');
  out.replaceChildren(document.createTextNode(text));
  if (reference) {
    const link = el('a',reference.label);
    link.href = reference.url;
    link.rel = 'noreferrer';
    out.append(document.createTextNode(' '),link);
  }
}
$('course').addEventListener('change',course);
add(); add(); renderRows(); course(); showDelayed();
