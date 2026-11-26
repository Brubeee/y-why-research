// GLM Formula Recognition transport only. Does not run a verdict or confirm text.
import { parseAffineDisplay } from './affine_scope.mjs';

export const GLM_FORMULA_MODE = 'glm-ocr/formula-recognition';
const MAX_ROWS = 12;
const refused = (raw, reason) => ({status:'unavailable',raw,reason,rows:[]});
const ARRAY = /^\$\$[ \n\r\t]*\\begin\{array\}\{l\}([\s\S]+)\\end\{array\}[ \n\r\t]*\$\$$/;
const UNAMBIGUOUS = /^(?:[0-9A-Za-z.=+*/×÷−\- (){}\t\r\n]|\\(?:dfrac|tfrac|frac|left|right|cdot|times|div)(?![A-Za-z]))+$/;

export function draftGlmFormulaPage({raw,mode,limitHit,expectedRows} = {}) {
  if (typeof raw!=='string' || raw.length>8192) return refused(null,'output-size');
  if (mode!==GLM_FORMULA_MODE || limitHit!==false) return refused(raw,'unverified-generation');
  if (expectedRows!==undefined && (!Number.isInteger(expectedRows) || expectedRows<2 || expectedRows>MAX_ROWS))
    return refused(raw,'invalid-independent-count');
  const body=ARRAY.exec(raw.trim())?.[1];
  if (!body) return refused(raw,'unsupported-page-format');
  const lines=body.split('\\\\').map(s=>s.trim());
  if (lines.at(-1)==='') lines.pop();
  if (lines.length<2 || lines.length>MAX_ROWS || lines.some(s=>!s))
    return refused(raw,'unusable-row-structure');
  if (expectedRows!==undefined && lines.length!==expectedRows)
    return refused(raw,'independent-count-mismatch');
  const rows=[];
  let variable=null;
  for (const [index, latex] of lines.entries()) {
    // Plain spaces between numeric characters inside this known TeX math
    // block are display whitespace. Explicit spacing commands are refused,
    // as are newlines/tabs splitting digits, rather than inventing boundaries.
    if (latex.length>512 || !UNAMBIGUOUS.test(latex) ||
        /[0-9.][ \t\r\n]*[\t\r\n][ \t\r\n]*(?=[0-9.])/.test(latex) ||
        /\.\s*\./.test(latex)) return refused(raw,'unsupported-written-form');
    const display=latex.replace(/(?<=[0-9.]) +(?=[0-9.])/g,'');
    const canCheck=parseAffineDisplay(display);
    if (!canCheck.parsed || (index===0 && !canCheck.parsed.variable) ||
        (index>0 && canCheck.parsed.variable && canCheck.parsed.variable!==variable))
      return refused(raw,'outside-exact-grammar');
    if(index===0) variable=canCheck.parsed.variable;
    rows.push({line:index+1,rawLatex:latex,text:canCheck.text,confirmed:false});
  }
  // A well-formed model array is not proof the page had these rows or no
  // others. A matching independent count also cannot attest transcription.
  return {status:'review-required',raw,
    rowCountEvidence:expectedRows===undefined?'not-checked':'matches-independent-count',rows};
}
