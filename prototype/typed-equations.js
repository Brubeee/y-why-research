(function () {
  'use strict';

  const input = document.getElementById('work');
  const check = document.getElementById('check');
  const clear = document.getElementById('clear');
  const title = document.getElementById('result-title');
  const list = document.getElementById('steps');
  const review = document.getElementById('review');
  const probe = document.getElementById('probe');
  const probeQuestion = document.getElementById('probe-question');
  const probeOptions = document.getElementById('probe-options');
  const probeRationale = document.getElementById('probe-rationale');
  const probeCheck = document.getElementById('probe-check');
  const probeResult = document.getElementById('probe-result');
  const PATTERN_MAP = {
    'constant-shift': {
      equation: 'u + 3 = 8',
      question: 'Solve this follow-up equation:',
      rationale: 'Mathematical check: subtract 3 from both sides: u + 3 − 3 = 8 − 3, so u = 5. The answer u = 11 gives 14 on the left, so it does not satisfy the equation.',
      options: [
        ['11', 'u = 11'],
        ['5', 'u = 5'],
        ['unsure', 'I am not sure'],
      ],
      interpretations: {
        '11': 'Tentative recurrence signal only: u = 11 repeats an add-instead-of-subtract result for this fixed example. It does not independently verify a misconception or learning pattern.',
        '5': 'This response is correct for the fixed example, so this probe does not show recurrence of the earlier visible pattern. One correct answer does not explain the earlier step.',
        unsure: 'The response is inconclusive. Abstain from interpreting the earlier step and ask a teacher to review the work and context.',
      },
    },
    'coefficient-change': {
      equation: '3v = 12',
      question: 'Solve this follow-up equation:',
      rationale: 'Mathematical check: divide both sides by 3: 3v ÷ 3 = 12 ÷ 3, so v = 4. Substitution confirms 3 × 4 = 12; v = 12 gives 36, and v = 36 gives 108.',
      options: [
        ['12', 'v = 12'],
        ['4', 'v = 4'],
        ['36', 'v = 36'],
        ['unsure', 'I am not sure'],
      ],
      interpretations: {
        '12': 'Tentative recurrence signal only: v = 12 is consistent with omitting the coefficient 3 in this fixed example. It does not independently verify a misconception or learning pattern.',
        '4': 'This response is correct for the fixed example, so this probe does not show recurrence of the earlier visible pattern. One correct answer does not explain the earlier step.',
        '36': 'This answer is incorrect for the fixed example, but it does not match the coefficient-omission response. Abstain from assigning a reason and ask a teacher to review.',
        unsure: 'The response is inconclusive. Abstain from interpreting the earlier step and ask a teacher to review the work and context.',
      },
    },
  };
  let observedPattern = null;

  // Parse a deliberately small grammar: integer terms like 3x, -x, + 4.
  function parseSide(source) {
    const compact = source.replace(/\u2212/g, '-').replace(/\s+/g, '');
    if (!compact) throw new Error('An equation side is empty.');
    const tokens = compact.match(/[+-]?[^+-]+/g);
    if (!tokens || tokens.join('') !== compact) throw new Error('Use simple integer terms such as 3x, -x, or 4.');
    let a = 0;
    let b = 0;
    for (const token of tokens) {
      if (/^[+-]?(?:\d+)?x$/i.test(token)) {
        const coefficient = token.replace(/x/i, '');
        a += coefficient === '' || coefficient === '+' ? 1 : coefficient === '-' ? -1 : Number(coefficient);
      } else if (/^[+-]?\d+$/.test(token)) {
        b += Number(token);
      } else {
        throw new Error(`I could not read “${token}”. Use integer constants and terms like 2x.`);
      }
    }
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || Math.abs(a) > 1000000 || Math.abs(b) > 1000000) throw new Error('The numbers are too large for this prototype.');
    return { a, b };
  }

  function parseEquation(line) {
    const equalities = (line.match(/=/g) || []).length;
    if (equalities !== 1) throw new Error('Each line needs exactly one equals sign.');
    const [left, right] = line.split('=');
    const l = parseSide(left);
    const r = parseSide(right);
    return { a: l.a - r.a, b: r.b - l.b };
  }

  function sameSolutions(one, two) {
    // A*x = b: compare identity, contradiction, or the exact integer cross product.
    if (one.a === 0 || two.a === 0) return one.a === 0 && two.a === 0 && ((one.b === 0) === (two.b === 0));
    return one.a * two.b === two.a * one.b;
  }

  function classify(previous, current) {
    if (sameSolutions(previous, current)) return { status: 'Equivalent', kind: 'good', message: 'This line keeps the same solution set as the line above.' };
    const da = current.a - previous.a;
    const db = current.b - previous.b;
    if (da === 0 && db !== 0) return { status: 'Changed', pattern: 'constant-shift', kind: 'bad', message: 'In the normalized equation, the variable coefficient stayed the same while the constant changed. This changes the solution.' };
    if (da !== 0 && db === 0) return { status: 'Changed', pattern: 'coefficient-change', kind: 'bad', message: 'In the normalized equation, the variable coefficient changed while the constant stayed the same. Check the transformation on both sides.' };
    return { status: 'Changed', kind: 'flag', message: 'The equation’s solution changed. This checker cannot identify a simple step pattern here.' };
  }

  function show() {
    list.replaceChildren();
    review.hidden = true;
    probe.hidden = true;
    observedPattern = null;
    review.textContent = '';
    const lines = input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      title.textContent = 'Add at least two equation lines.';
      list.innerHTML = '<p class="empty">The checker needs a starting equation and one next step.</p>';
      return;
    }
    const parsed = [];
    let parseProblem = null;
    for (let i = 0; i < lines.length; i += 1) {
      try { parsed.push(parseEquation(lines[i])); }
      catch (error) { parseProblem = { index: i, message: error.message }; break; }
    }
    let changed = false;
    let firstChangeSeen = false;
    let firstCandidatePattern = null;
    parsed.forEach((equation, index) => {
      const row = document.createElement('article');
      if (index === 0) {
        row.className = 'step';
        row.innerHTML = `<span class="badge">START</span><strong>${escapeHtml(lines[index])}</strong><p>Starting point for this comparison.</p>`;
      } else {
        const outcome = classify(parsed[index - 1], equation);
        changed ||= outcome.status === 'Changed';
        row.className = `step ${outcome.kind}`;
        if (outcome.status === 'Changed' && !firstChangeSeen) {
          firstChangeSeen = true;
          firstCandidatePattern = outcome.pattern || null;
          row.className = `step ${outcome.pattern ? 'bad' : 'flag'}`;
          row.innerHTML = `<span class="badge">FIRST-ERROR CANDIDATE</span><strong>${escapeHtml(lines[index])}</strong><p>${outcome.message} This is a candidate based only on the typed steps.</p>`;
        } else if (firstChangeSeen) {
          row.className = 'step flag';
          row.innerHTML = `<span class="badge">DOWNSTREAM</span><strong>${escapeHtml(lines[index])}</strong><p>This line follows the first solution-changing transition. It is not marked as another first error; its interpretation may depend on the earlier change.</p>`;
        } else {
          row.innerHTML = `<span class="badge">${outcome.status.toUpperCase()}</span><strong>${escapeHtml(lines[index])}</strong><p>${outcome.message}</p>`;
        }
      }
      list.append(row);
    });
    if (parseProblem) {
      const row = document.createElement('article');
      row.className = 'step flag';
      row.innerHTML = `<span class="badge">INPUT UNCLEAR</span><strong>Line ${parseProblem.index + 1}: ${escapeHtml(lines[parseProblem.index])}</strong><p>${escapeHtml(parseProblem.message)} Later steps cannot be checked from this point.</p>`;
      list.append(row);
    }
    observedPattern = firstCandidatePattern;
    if (firstChangeSeen) {
      title.textContent = firstCandidatePattern ? 'First solution-changing transition identified as a candidate.' : 'First solution-changing transition needs review.';
      if (parseProblem) {
        setReview('Teacher review suggested', 'The first solution-changing transition remains a tentative candidate. A later line could not be parsed, so the remaining work needs teacher review.');
      } else {
        setReview('Tentative visible pattern', 'This is a deterministic comparison of typed equations, not a diagnosis. Later lines are shown as downstream of this candidate. Teacher review is needed to check transcription, context, and the intended work.');
      }
      probe.hidden = !PATTERN_MAP[firstCandidatePattern];
      if (!probe.hidden) configureProbe(PATTERN_MAP[firstCandidatePattern]);
      probeResult.textContent = '';
      return;
    }
    if (parseProblem) {
      title.textContent = 'I need a clearer typed line.';
      setReview('Needs review', 'The line is outside this prototype’s supported notation. No conclusion was made about the learner or their reasoning.');
      return;
    }
    if (!changed) {
      title.textContent = 'Every typed step keeps the same solution.';
      setReview('A limited check', 'Equivalent solution sets do not show whether a written transformation was justified in the learner’s context. Treat this as a math check, not a diagnosis.');
    }
  }

  function configureProbe(pattern) {
    probeQuestion.textContent = `${pattern.question}  ${pattern.equation}`;
    probeRationale.textContent = pattern.rationale;
    probeRationale.hidden = true;
    probeOptions.replaceChildren();
    pattern.options.forEach(([value, label], index) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'probe-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'probe-answer';
      radio.value = value;
      radio.checked = false;
      const text = document.createElement('span');
      text.textContent = label;
      wrapper.append(radio, text);
      probeOptions.append(wrapper);
    });
  }

  probeCheck.addEventListener('click', () => {
    const selected = probeOptions.querySelector('input[name="probe-answer"]:checked');
    if (!selected) { probeResult.textContent = 'Choose an answer or select “I am not sure.”'; return; }
    const interpretation = PATTERN_MAP[observedPattern].interpretations[selected.value];
    probeResult.textContent = `${interpretation} Teacher review of the full work and context remains necessary.`;
    probeRationale.hidden = false;
  });

  function setReview(label, message) {
    review.hidden = false;
    const strong = document.createElement('strong');
    strong.textContent = label;
    review.append(strong, document.createTextNode(message));
  }
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  check.addEventListener('click', show);
  clear.addEventListener('click', () => { input.value = ''; probeResult.textContent = ''; title.textContent = 'Ready when you are.'; list.innerHTML = '<p class="empty">Run the checker to see how each line compares.</p>'; review.hidden = true; probe.hidden = true; });
})();
