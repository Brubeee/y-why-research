# From a checked line to a fresh retry

This small, assistant-assisted reference starts with one confirmed error the
exact checker can locate. Its rules compare two executable ways a negative
factor could have been handled. A match is about the written response, not a
diagnosis of the student. A supported collision can open a different practice
item, `2−4(2z−3)`, which adds an outside constant and a non-unit coefficient.
No language model or learner training is used here.

**Correct value is not always finished work.** A student asked to expand
`−3(y−2)` can write `−3y+6` or `6−3y`. Copying the bracketed input is equivalent
but unfinished. Writing `(−3)·y+(−3)·(−2)` performs distribution but leaves
arithmetic unfinished. The form check reads the answer as written separately
from the exact affine comparison. It deliberately supports only a simplified
integer variable term and integer constant. See [STACK's documentation on
equivalence and form](https://docs.stack-assessment.org/en/Authoring/Answer_Tests/Equivalence/)
for precedent.

Before related practice or its hint can open, the separator accepts one
supported, simplified response or an explicit skip. Blank, unsupported and
unfinished work gets neutral format guidance without an exact answer or hint.
An unmodeled simplified response closes the separator as unresolved; skipping
also records no diagnostic evidence. Later practice cannot replace the first
response, and rechecking or editing in the same tab does not create a new
unaided opportunity. The earlier response is shown only for the same verified
source rows; the bookkeeping is in memory, not in saved review storage.

The retry keeps the first parseable response and first completed success
separate. Once the hint button is used, subsequent success is recorded as
hint-aided. Receiving correctness feedback on a previous attempt is not the
same as never receiving help; a no-hint success is not evidence of retention.
The session keeps attempt status and order in memory, not raw answer strings in
the retry history. Refreshing the page resets the history. There are no
accounts, notifications, measured learning gains, or delayed retention results.
The NCERT Grade 8 Part 1 chapter is a review link for the skill, not the
photographed question's inferred origin.

To reproduce: load a typed example, confirm the source and first changed line,
and choose Check selected work. Enter the unchanged bracketed expression in
either drill and then a simplified form. Try the fresh item once before and once
after opening its hint, or run the fixed-clock checks:

```sh
node --test paper_lab/*.test.mjs
python -m unittest discover -s paper_lab -p '*_test.py' -v
```
