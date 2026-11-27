import { findEquationWitness, verifyRows, parseExpression } from './verify.mjs';
import { checkOperationClaim, classifyTypedStep, checkTypedRepair, checkNeutralIntermediate, freshTaskForClaim, delayedTaskForClaim, createTypedRetry, exposeTypedRetryHint, recordTypedRetry } from './operation_claim.mjs';
import { diagnoseStep, interpretProbe } from './diagnostic.mjs';

import { curriculumReference } from './curriculum.mjs';
import { gradeExpansion } from './expansion_form.mjs';
import { createDelayedReview, REVIEW_KEY } from './delayed_review.mjs';
import { RETRY_TASK, createRetry, exposeRetryHint, recordRetry } from './memex.mjs';
import { draftGlmFormulaPage, GLM_FORMULA_MODE } from './math_ocr_probe/glm_page_draft.mjs';
import { validateCrop, mapOcrBoxes, encodeImageCrop } from './crop.mjs';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  if (cls) item.className = cls;
  return item;
};
// The opt-in private candidate never falls back to another OCR route silently.
const formulaPhoto = new URLSearchParams(window.location?.search ?? '').get('formula') === '1';
const photoEndpoint = formulaPhoto ? '/api/formula-draft' : '/api/ocr';
if (formulaPhoto) {
  $('ocr-note').textContent = 'Experimental whole-page formula OCR on the local host. Use one question per photo. Compare the complete ordered draft with the photo before checking.';
  $('draft-help').textContent = 'For a photo, check every proposed line in order. Fix any transcription errors and insert any missing steps as written. For typed work, enter the equation and each step in order.';
  $('anchor-text').textContent = 'I checked the full photo: every active line is present in order, from the original equation through my last written step.';
}
const delayedReview = createDelayedReview({store:() => window.localStorage});
let displayedReviewKey = null;
// The photo route uses a raw body. Keep headroom for a 4.5 MB ingress
// and mirror this cap in ocr_server.py.
const MAX_BYTES = 4_000_000;
const PHOTO_TOO_LARGE = 'Photo too large to process. Resize it or try a smaller photo (up to 4 MB).';
async function readOcrResponse(response) {
  if (response.status === 413) {
    // Only interpret the known same-origin JSON code. Proxies can return
    // arbitrary text, HTML or JSON for their own byte limits.
    if (response.headers?.get('Content-Type')?.split(';',1)[0].trim().toLowerCase() === 'application/json') {
      try {
        const body = await response.json();
        if (body?.status === 'error' && body.reason === 'photo_dimensions')
          return {error:'The photo resolution is too high. Resize its pixel dimensions or retake it at a lower resolution; file compression alone will not help.'};
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
    }
    return {error:PHOTO_TOO_LARGE};
  }
  try { return await response.json(); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    if (response.ok) throw new Error('The OCR response was not usable.');
    return null;
  }
}
const MAX_ROWS = 45;
let rows = [], objectUrl, dims, inflight, revision = 0, draftRevision = 0, chainRevision = 0, diagnosis = null, skillMatch = null;
let currentFile = null, region = null, selecting = false, corner = null, retrySession = null;
let currentProbe = null, firstSeparator = null, photoCandidate = null, typedWorkflow = false, currentActionContext = null;
let busyPhoto = null;
let typedRepairMode = null, typedRepairContext = null, typedRetryTask = null, typedRetrySession = null;
const shownPracticeIds = new Set();
const clearAttestation = () => { $('anchor-check').checked = false; };
function regionButtons() {
  const img = $('image');
  const compatible = !formulaPhoto && !!currentFile && !!dims && img.naturalWidth === dims.width && img.naturalHeight === dims.height;
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
function dropPhotoRetry(message) {
  if (!busyPhoto) return;
  const {picker} = busyPhoto;
  busyPhoto = null;
  if ([$('photo-retry'), $('photo-discard')].includes(document.activeElement)) picker.focus();
  $('photo-recovery').hidden = true;
  if (message) status(message);
}
function advanceDraft() {
  draftRevision++;
  dropPhotoRetry('Kept your current work. The pending photo was discarded after a change.');
}
function resetResult(message = 'Run the check on your selected, confirmed lines.', advanceChain = true) {
  advanceDraft();
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
  clearTypedRepairFlow();
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
function clearTypedRetry() {
  typedRetryTask = null; typedRetrySession = null;
  $('typed-retry').hidden = true;
  $('typed-retry-question').textContent = '';
  $('typed-retry-hint').disabled = true;
  $('typed-retry-hint-text').hidden = true;
  $('typed-retry-hint-text').textContent = '';
  $('typed-retry-result').textContent = '';
  $('typed-retry-evidence').textContent = '';
  $('typed-retry-answer').value = '';
  showDelayed();
}
function clearTypedRepairFlow() {
  typedRepairMode = null; typedRepairContext = null;
  $('typed-repair-form').hidden = true;
  $('typed-repair-question').textContent = '';
  $('typed-repair-answer').value = '';
  $('typed-repair-feedback').textContent = '';
  clearTypedRetry();
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
    select.disabled = formulaPhoto && !!currentFile;
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
      if (select.disabled) { select.checked = row.selected; return; }
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
function cancelPhotoReread() {
  const owner = inflight;
  inflight = null; revision++;
  owner?.abort();
}
function clearPhoto() {
  dropPhotoRetry();
  cancelPhotoCandidate();
  cancelPhotoReread();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null; dims = null; currentFile = null; clearRegion(); clearAttestation();
  $('region-tools').hidden = true; $('anchor-control').hidden = true;
  $('image').removeAttribute('src'); $('photo-view').hidden = true; $('crop').hidden = true;
  for (const id of ['photo','camera-photo']) $(id).value = '';
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
function prepareFormulaRows(data) {
  if (data?.engine !== 'glm-ocr' || data?.status !== 'unconfirmed' ||
      data?.reviewRequired !== true || data?.mode !== GLM_FORMULA_MODE)
    throw new Error('The formula OCR response was not usable.');
  const draft = draftGlmFormulaPage({raw:data.raw, mode:data.mode, limitHit:data.limitHit});
  if (draft.status !== 'review-required' || draft.rows.some(row => row.text.length > 180))
    throw new Error('This photo did not yield a usable ordered equation draft. Use one clear question per photo, or type all its lines.');
  return draft.rows.map(row => ({text:row.text, rawLatex:row.rawLatex, box:null,
    selected:true, confirmed:false}));
}
const formulaReady = n => 'Draft ready: ' + n + ' proposed lines, not verified. Compare the complete order and every symbol with the original photo. Add any missing active line.';
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
  if (!currentFile || (formulaPhoto && target)) return;
  dropPhotoRetry();
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
    if (!file.size || file.size > MAX_BYTES) throw new Error(PHOTO_TOO_LARGE);
    const r = await fetch(photoEndpoint, {method:'POST',headers:{'Content-Type':file.type},body:file,signal:owner.signal});
    if (!applicable()) return;
    let data = await readOcrResponse(r);
    if (!applicable()) return;
    if (!r.ok) throw new Error(data?.error || 'OCR could not read this photo.');
    if (formulaPhoto) {
      const nextRows = prepareFormulaRows(data);
      if (!applicable()) return;
      rows = nextRows;
      clearAttestation(); resetResult(); renderRows();
      status(formulaReady(nextRows.length));
      return;
    }
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

function selectPhoto(picker) {
  const file = picker.files?.[0];
  if (!file) return; // Closing the picker without selecting isn't a new request.
  // Retain the File, but allow a same-file retry even if this read is discarded.
  picker.value = '';
  dropPhotoRetry();
  // A new selection takes ownership even if it fails validation. Do not clear
  // any committed photo, rows, or feedback until a replacement actually succeeds.
  cancelPhotoCandidate();
  cancelPhotoReread();
  if (!['image/png','image/jpeg'].includes(file.type) || !file.size || file.size > MAX_BYTES) {
    const heic = /^(?:image\/(?:heic|heif)(?:-sequence)?)$/i.test(file.type)
      || /\.(?:heic|heif)$/i.test(file.name ?? '');
    status(heic
      ? 'This photo is HEIC or HEIF. Save a JPEG copy and choose it here. Your current work is unchanged.'
      : 'Choose a nonempty PNG or JPEG no larger than 4 MB. Your current work is unchanged.');
    return;
  }
  return startPhotoCandidate(file,picker);
}
for (const id of ['photo','camera-photo']) {
  const picker = $(id);
  picker.addEventListener('change', () => selectPhoto(picker));
}
$('photo-retry').addEventListener('click', () => {
  const pending = busyPhoto;
  if (!pending || pending.draft !== draftRevision) return;
  dropPhotoRetry();
  return startPhotoCandidate(pending.file,pending.picker);
});
$('photo-discard').addEventListener('click', () => {
  dropPhotoRetry('New photo discarded. Kept your current work.');
});
async function startPhotoCandidate(file,picker) {
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
    const result = await fetch(photoEndpoint, {method:'POST',headers:{'Content-Type':file.type},body:file,signal:owner.abort.signal});
    if (!applicable()) return;
    const data = await readOcrResponse(result);
    if (!applicable()) return;
    if (!result.ok) {
      if (formulaPhoto && result.status === 503 && data?.status === 'error' && data.reason === 'formula_busy') {
        busyPhoto = {file, draft, picker};
        $('photo-recovery').hidden = false;
        status('The photo reader is busy. Wait a moment, then retry this photo without taking it again. Your current work is unchanged.');
        return;
      }
      const detail = data?.error || 'OCR could not read this photo.';
      const reason = [413,415,422].includes(result.status) ? detail : 'OCR temporarily unavailable. ' + detail;
      status(reason + ' Photo not replaced. You can try another image or enter lines by hand.');
      return;
    }
    const {size,prepared} = formulaPhoto ? {size:null,prepared:prepareFormulaRows(data)}
      : prepareRows(data,null,file.type === 'image/png');
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
    currentFile = file; objectUrl = url; dims = size && {...size};
    $('image').src = objectUrl; $('photo-view').hidden = false;
    $('region-tools').hidden = formulaPhoto; $('anchor-control').hidden = false;
    resetTypedEntry();
    rows = prepared;
    if (!rows.length) { add(); add(); }
    resetResult(); renderRows(); regionButtons();
    if (formulaPhoto) status(formulaReady(prepared.length));
    else status(data.lines.length
      ? 'Draft ready: ' + data.lines.length + ' detected lines. Select one question and verify signs, brackets, and reading order. ' + (data.lines.length > MAX_ROWS ? 'Only the first ' + MAX_ROWS + ' lines are shown. Try selecting a smaller area.' : '')
      : 'No text detected in the new photo. Try another area or type the lines.');
  } catch (e) {
    if (applicable()) {
      status('Photo not replaced. ' + e.message + ' Try again or type the lines.');
    }
  } finally {
    if (photoCandidate === owner) photoCandidate = null;
    disposePhotoCandidate(owner);
  }
}
$('image').addEventListener('load', () => { regionButtons(); syncPhotoDispositions.forEach(sync => sync()); });
$('select-region').addEventListener('click', () => {
  if ($('select-region').disabled) return;
  advanceDraft();
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
  advanceDraft();
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
const supportedBalanceKinds = ['add','subtract','multiply','divide'];
const operationDescription = claim => {
  const value=String(claim?.constant ?? '').trim();
  if (claim?.kind==='add') return `add ${value} to both sides`;
  if (claim?.kind==='subtract') return `subtract ${value} from both sides`;
  if (claim?.kind==='multiply') return `multiply both sides by ${value}`;
  if (claim?.kind==='divide') return `divide both sides by ${value}`;
  if (claim?.kind==='distribution-left') return 'distribute the factor on the left';
  if (claim?.kind==='distribution-right') return 'distribute the factor on the right';
  return 'use one step at a time';
};
function confirmedTutoringSource() {
  if (!rows.every(row => row.selected && row.confirmed && row.text.trim())) return null;
  if (currentFile) return formulaPhoto && $('anchor-check').checked ? 'formula-photo' : null;
  return typedWorkflow ? 'typed' : null;
}
function currentTypedActionIsLive(context=currentActionContext) {
  return !!context?.source && context.source===confirmedTutoringSource() && context.revision===chainRevision &&
    context.file===currentFile && context.allRows.length===rows.length &&
    context.allRows.every(({row,text},i)=>rows[i]===row && row.text===text) &&
    rows[context.beforeIndex]===context.beforeRow && rows[context.afterIndex]===context.afterRow &&
    context.beforeRow?.confirmed===true && context.afterRow?.confirmed===true &&
    context.beforeRow.text===context.before.text && context.afterRow.text===context.after.text;
}
$('operation-kind').addEventListener('change', () => {
  clearTypedRepairFlow();
  const needsConstant = supportedBalanceKinds.includes($('operation-kind').value);
  $('operation-constant-field').hidden = !needsConstant;
  $('operation-constant').disabled = !needsConstant;
  if (!needsConstant) $('operation-constant').value = '';
  $('operation-feedback').textContent = '';
});
$('operation-constant').addEventListener('input', () => {
  clearTypedRepairFlow();
  $('operation-feedback').textContent = '';
});
$('operation-claim-form').addEventListener('submit', event => {
  event.preventDefault();
  const kind = $('operation-kind').value;
  if (!currentTypedActionIsLive() || $('operation-claim-panel').hidden)
    return;
  if (!kind) {
    $('operation-feedback').textContent = 'Choose one move, More than one move, or Not sure.';
    return;
  }
  const claim = {kind,constant:$('operation-constant').value.trim()};
  // A second tap on the same declared move must not discard a live retry.
  if (currentTypedActionIsLive(typedRepairContext) &&
      typedRepairContext.claim?.kind === claim.kind &&
      typedRepairContext.claim?.constant === claim.constant) return;
  const result = classifyTypedStep({
    before:currentActionContext.before,
    observed:currentActionContext.after,
    claim,
  });
  clearTypedRepairFlow();
  if (result.status === 'actionable') {
    typedRepairMode='declared';
    typedRepairContext={...currentActionContext,claim};
    if (kind === 'distribution-left' || kind === 'distribution-right') {
      $('operation-feedback').textContent = `This is one declared expansion on the ${result.focusSide}. It does not diagnose why the written line changed.`;
      $('typed-repair-question').textContent = `From ${currentActionContext.before.text}, ${operationDescription(claim)}. Enter one corrected intermediate equation; leave the other side as written.`;
    } else {
      const matchingSide=result.focusSide==='left'?'right':'left';
      $('operation-feedback').textContent = `Your written line matches the declared action on the ${matchingSide} side. Check the other side; this is not a diagnosis of your reasoning.`;
      $('typed-repair-question').textContent = `From ${currentActionContext.before.text}, ${operationDescription(claim)}. Enter one corrected intermediate equation.`;
    }
    $('typed-repair-form').hidden=false;
  } else if (result.status === 'neutral') {
    typedRepairMode='neutral';
    typedRepairContext={...currentActionContext};
    $('operation-feedback').textContent = result.reason === 'both-sides-mismatch'
      ? 'Neither side matches that single action. This could be a combined step, so I will not choose a side.'
      : 'I cannot separate one supported move from this step, so I will not infer an action.';
    $('typed-repair-question').textContent = `If useful, enter one neutral intermediate equation after a single move from ${currentActionContext.before.text}. I can check solution-set preservation, but not attribute the move.`;
    $('typed-repair-form').hidden=false;
  } else {
    $('operation-feedback').textContent = 'This step is not available for a supported repair. Use one confirmed equation in the current exact affine grammar.';
  }
});
function typedRetryStatus(event) {
  if (!event) return '';
  return ({
    supported:'The exact equation and declared move match',
    'equivalent-other':'The equation preserves the solution set but does not show this move',
    'neutral-equivalent':'The equation preserves the solution set; the action is still unattributed',
    'not-equivalent':'The response changes the solution set',
    blocked:'The equation is outside the supported exact check',
  })[event.status] || 'No exact result is available';
}
function showTypedRetry() {
  if (!typedRetryTask || !typedRetrySession || !currentTypedActionIsLive(typedRepairContext)) return;
  $('typed-retry').hidden=false;
  $('typed-retry-question').textContent = `Fresh equation: ${typedRetryTask.source}. ${typedRetryTask.instruction.replace(/^Fresh equation: /,'')}`;
  $('typed-retry-submit').textContent = !typedRetrySession.firstResponse ? 'Check first response'
    : typedRetrySession.hintExposed ? 'Check aided correction' : 'Check another response';
  $('typed-retry-hint').disabled = !typedRetrySession.firstResponse || typedRetrySession.hintExposed ||
    typedRetrySession.events.length >= 120;
  $('typed-retry-hint-text').hidden = !typedRetrySession.hintExposed;
  $('typed-retry-hint-text').textContent = typedRetrySession.hintExposed ? typedRetryTask.hint : '';
  const last=typedRetrySession.lastEvent;
  $('typed-retry-result').textContent = last?.kind === 'attempt'
    ? `${typedRetryStatus(last)}. No answer is shown.` : '';
  const first=typedRetrySession.firstResponse, success=typedRetrySession.firstSuccess;
  const successTiming=success?.mode === 'no-hint' ? 'before help'
    : success?.mode === 'after-feedback' ? 'after feedback' : 'after a hint';
  const hasAttempt=typedRetrySession.events.some(event=>event.kind === 'attempt');
  $('typed-retry-evidence').textContent = first
    ? `First evaluable response before help: ${typedRetryStatus(first)}. ` +
      (success ? `First supported response: ${successTiming}.` : 'No supported response is recorded yet.')
    : hasAttempt
      ? 'No evaluable equation has been checked yet. Enter one before opening a hint. This record stays on this page only.'
      : 'No response recorded. Try once before opening a hint. This record stays on this page only.';
  showDelayed();
}
$('typed-repair-answer').addEventListener('input', () => {
  $('typed-repair-feedback').textContent='';
  if (typedRetrySession) clearTypedRetry();
});
$('typed-repair-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!typedRepairContext || !currentTypedActionIsLive(typedRepairContext) || $('typed-repair-form').hidden) return;
  const candidate={text:$('typed-repair-answer').value.trim(),confirmed:true};
  if (!candidate.text) {
    $('typed-repair-feedback').textContent='Enter one equation line before checking it.';
    return;
  }
  const result=typedRepairMode === 'declared'
    ? checkTypedRepair({before:typedRepairContext.before,candidate,claim:typedRepairContext.claim})
    : checkNeutralIntermediate({before:typedRepairContext.before,candidate});
  if (result.status === 'supported') {
    if (typedRetrySession) return; // An unchanged resubmission cannot restart a first attempt.
    typedRetryTask=freshTaskForClaim(typedRepairContext.claim,{
      confirmedRows:typedRepairContext.allRows.map(({text})=>({text,confirmed:true})),
      repair:candidate.text, seenIds:[...shownPracticeIds],
    });
    typedRetrySession=createTypedRetry(typedRetryTask);
    $('typed-repair-feedback').textContent='The line preserves the preceding solution set and shows the declared move. ' +
      (typedRetrySession ? 'A different problem is ready below.' : 'I do not have a distinct verified practice item for this repair.');
    if (!typedRetrySession) return;
    shownPracticeIds.add(typedRetryTask.id);
    $('typed-retry-answer').value='';
    showTypedRetry();
  } else if (result.status === 'equivalent-other') {
    $('typed-repair-feedback').textContent='This equation preserves the solution set, but it does not show the declared one-step move. It is not marked wrong; enter one line that shows that move.';
  } else if (result.status === 'neutral-equivalent' || result.status === 'equivalent-unattributed') {
    $('typed-repair-feedback').textContent='This equation preserves the solution set. The action is still ambiguous, so I cannot confirm the reasoning or select a fresh retry.';
  } else if (result.status === 'not-equivalent') {
    $('typed-repair-feedback').textContent='This line changes the solution set from the preceding equation. Check one move at a time; no solution is shown.';
  } else {
    $('typed-repair-feedback').textContent='I cannot check this line in the supported exact affine grammar. No repair verdict was issued.';
  }
});
$('typed-retry-hint').addEventListener('click', () => {
  if (!currentTypedActionIsLive(typedRepairContext) || !typedRetrySession || !typedRetrySession.firstResponse || $('typed-retry').hidden) return;
  typedRetrySession=exposeTypedRetryHint(typedRetrySession);
  showTypedRetry();
});
$('typed-retry-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!currentTypedActionIsLive(typedRepairContext) || !typedRetryTask || !typedRetrySession || $('typed-retry').hidden) return;
  typedRetrySession=recordTypedRetry(typedRetrySession,{text:$('typed-retry-answer').value});
  showTypedRetry();
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
  $('result-heading').focus();
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
  $('typed-work').focus();
});
$('verify').addEventListener('click', checkSelectedWork);
function checkSelectedWork() {
  if (currentTypedActionIsLive()) {
    // Preserve the proof, repair and first-attempt record for the exact same
    // confirmed source. An actual source edit still invalidates them.
    advanceDraft();
    return;
  }
  resetResult(undefined,false);
  const picked = rows.map((r,i)=>({...r,sourceIndex:i})).filter(r => r.selected);
  if (formulaPhoto && currentFile && (picked.length !== rows.length ||
      picked.some(r=>!r.confirmed || !r.text.trim()) || !$('anchor-check').checked)) {
    resetResult('Confirm every line and the complete order against the original photo before checking. No verdict was issued.');
    return;
  }
  if (typedWorkflow && !confirmedTutoringSource()) {
    resetResult('Confirm this transcription for every typed line and include the complete ordered chain. No verdict was issued.');
    return;
  }
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
  const tutoringSource = confirmedTutoringSource();
  const result = verifyRows({anchor,rows:steps});
  const labels = {equivalent:'Same solution set',changed:'First verified change',unsupported:'Cannot check this line',unconfirmed:'Needs transcription confirmation','not-considered':'Not checked'};
  if (result.anchor.status === 'confirmed' && result.anchor.solution?.kind === 'unique') { skillMatch = 'linear'; course(); }
  const anchorMessage = !tutoringSource || result.anchor.status !== 'confirmed' ? result.anchor.message
    : result.anchor.solution.kind === 'unique' ? 'Confirmed starting equation; its exact solution is not shown.'
    : result.anchor.solution.kind === 'all' ? 'The starting equation is an identity (all real values).'
    : 'The starting equation is a contradiction (no solutions).';
  const out = $('verdict'); out.replaceChildren(el('p','Original equation: ' + anchor.text + '. ' + anchorMessage));
  if (currentFile) out.append(el('p',formulaPhoto ? 'Confirmed transcription only. This is not a grade for the whole question.'
    : 'Selected steps only. This is not a pass or grade for the whole question.','fine'));
  const skippedLines = rows.map((row,i)=>row.crossedOut && i>anchor.sourceIndex && i<picked.at(-1).sourceIndex ? i+1 : null).filter(Boolean);
  if (skippedLines.length) out.append(el('p', 'Marked crossed out; not checked: line ' + skippedLines.join(', ') + '.', 'fine'));
  result.rows.forEach((r,i) => {
    const message = !tutoringSource ? r.message
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
    source:tutoringSource, file:currentFile, allRows:rows.map(row=>({row,text:row.text})),
    revision:chainRevision,
    beforeIndex:before.sourceIndex,
    afterIndex:after.sourceIndex,
    beforeRow:rows[before.sourceIndex],
    afterRow:rows[after.sourceIndex],
    before:{text:before.text,confirmed:before.confirmed},
    after:{text:after.text,confirmed:after.confirmed},
  };
  if (tutoringSource) {
    $('probe').hidden = false;
    $('probe-question').textContent = 'Choose one move for the first changed step. The checker will not infer what you were thinking.';
    $('operation-claim-panel').hidden = false;
    $('probe-form').hidden = true;
    $('probe-skip').hidden = true;
    $('retry').hidden = true;
    return;
  }
  diagnosis = diagnoseStep(before.text,after.text);
  if (diagnosis.status !== 'ambiguous' || !diagnosis.probe) {
    $('probe').hidden = false;
    $('probe-question').textContent = 'What operation did you apply here?';
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

function availableReview() {
  if (!$('typed-retry').hidden && typedRetrySession?.firstSuccess && currentTypedActionIsLive(typedRepairContext)) {
    const selected = delayedTaskForClaim(typedRepairContext.claim,{
      confirmedRows:typedRepairContext.allRows.map(({text})=>({text,confirmed:true})),
      repair:$('typed-repair-answer').value.trim(),
      practiceId:typedRetryTask.id,
    });
    return selected ? {item:selected.id} : null;
  }
  return diagnosis?.probe && !$('retry').hidden && retrySession?.firstSuccess ? {} : null;
}
function showDelayed(state=delayedReview.inspect({includeKey:true})) {
  if (state.status==='ready' && !state.key) {
    const latest=delayedReview.inspect({includeKey:true});
    const notes=latest.status==='ready' && latest.prompt===state.prompt
      ? {needsReadable:state.needsReadable,stale:state.stale} : {};
    state={...latest,...notes};
  }
  if ((state.key ?? null)!==displayedReviewKey || state.stale) $('delayed-answer').value='';
  displayedReviewKey=state.key ?? null;
  const offer = !!availableReview() && state.status==='empty';
  const ready = state.status==='ready';
  const equation = state.format==='equation';
  const text = {
    empty: offer ? 'Save a different exercise to try without a hint tomorrow.' : '',
    waiting: state.dueAt ? 'Available after ' + new Date(state.dueAt).toLocaleString() + ' (this device’s clock).' : '',
    ready: state.stale ? 'This review changed in another tab. No response was recorded.' : state.needsReadable
      ? (equation ? 'Enter one readable equation. No response was recorded.' :
        'Enter one readable expression without an equals sign. No response was recorded.')
      : 'One readable response will be recorded. No hints are shown for this question.',
    complete: {
      correct:equation?'First readable answer: exact and shows the requested move.':'First readable answer: correct and fully simplified.',
      'not-yet':equation?'First readable answer: changes the solution set.':'First readable answer: not equivalent to the original.',
      unfinished:'First readable answer: equivalent but not fully simplified.',
      'equivalent-other':'First readable answer: preserves the solution set, but does not show the requested move.',
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
  $('delayed-answer-label').textContent = equation ? 'Your next equation' : 'Your expansion';
  $('delayed-prompt').textContent = ready ? equation ? state.prompt + '. ' + state.instruction
    : 'Expand and simplify without an equals sign: ' + state.prompt : '';
  if (!ready) $('delayed-answer').value = '';
}
$('delayed-save').addEventListener('click', () => {
  const offer=availableReview();
  if (offer && !$('delayed-save').hidden) showDelayed(delayedReview.optIn({consent:true,...offer}));
});
$('delayed-refresh').addEventListener('click', () => showDelayed());
$('delayed-clear').addEventListener('click', () => {
  $('delayed-answer').value = '';
  showDelayed(delayedReview.clear());
});
$('delayed-form').addEventListener('submit', e => {
  e.preventDefault();
  if ($('delayed-form').hidden || !displayedReviewKey) return;
  showDelayed(delayedReview.submit($('delayed-answer').value,{expectedKey:displayedReviewKey}));
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
