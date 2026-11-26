import { parseEquation } from '../verify.mjs';

// Audit ground truth for inclusion only. Never use this to repair OCR output
// or score literal fidelity. Preserve every visible math token, except the
// stacked fraction bar represented as two explicitly grouped operands.
export function affineReference(label) {
  const line = parseAffineDisplay(label);
  return line.parsed && !line.parsed.variable ? { reason: 'no-variable' } : line;
}

// Shared lossless display adapter for exact checking, including constant
// equalities. Inclusion policies (isolated formulas vs ordered rows) differ.
export function parseAffineDisplay(label) {
  if (typeof label !== 'string' || label.length > 512)
    return { reason: 'layout-outside-scope' };
  if ((label.match(/=/g) ?? []).length !== 1)
    return { reason: 'not-one-equality' };
  let i = 0;
  const tokens = /\\(?:dfrac|tfrac|frac)(?![a-zA-Z])|\\(?:left|right)(?=\s*[()])|\\(?:cdot|times|div)(?![a-zA-Z])|\\[,!;:]|[0-9A-Za-z.()=+*/×÷−\s-]/y;
  const operators = new Map([['\\cdot','*'],['\\times','*'],['\\div','/']]);
  const whitespace = () => { while (/\s/.test(label[i] ?? '')) i++; };
  function group(depth) {
    whitespace();
    if (depth > 12 || label[i++] !== '{') throw Error();
    const body = expression(true, depth);
    if (!body.trim() || body.includes('=') || label[i++] !== '}') throw Error();
    return body;
  }
  function expression(inGroup = false, depth = 0) {
    let out = '';
    while (i < label.length && !(inGroup && label[i] === '}')) {
      tokens.lastIndex = i;
      const match = tokens.exec(label);
      if (!match) throw Error();
      const token = match[0];
      i = tokens.lastIndex;
      if (['\\frac','\\dfrac','\\tfrac'].includes(token)) {
        // Reject mixed number notation and any ambiguous implicit product
        // adjacent to a stacked fraction; do not infer a missing operator.
        if (/[0-9A-Za-z.)]$/.test(out.trimEnd())) throw Error();
        const numerator = group(depth+1), denominator = group(depth+1);
        if (/^(?:\s|\\[,!;:])*(?:[0-9A-Za-z.(]|\\(?:left|frac|tfrac|dfrac))/.test(label.slice(i))) throw Error();
        out += `((${numerator})/(${denominator}))`;
      } else if (token === '\\left' || token === '\\right') {
        // The actual delimiter stays in the stream.
      } else {
        out += operators.get(token) ?? (token.startsWith('\\') ? ' ' : token);
      }
    }
    return out;
  }
  let text;
  try { text = expression().trim(); }
  catch { return { reason: 'layout-outside-scope' }; }
  const parsed = parseEquation(text);
  if (!parsed.ok) return { reason: 'checker-unsupported' };
  return { text, parsed };
}
