# Explicit operation claim: offline experiment

The verifier's solution-set result and a student's claim about a written
transition are separate. After `2(x+3)=10`, both `2x+6=10` and
`2x+3=7` preserve the solution. The second may be a valid combined step;
it does not fit "I only expanded the left bracket."

Only test an explicitly declared operation on two confirmed lines. The source
is a small signed integer multiplier on a two-term left bracket and an integer
literal on the right. The right-hand literal must stay as written, ignoring
leading/trailing whitespace and Unicode minus. Both standard term orders
are accepted via the existing written expansion check. Copied brackets or
unfinished arithmetic are not a completed expansion. None of these results
proves how the student thought or what action they took.

Run `node --test paper_lab/operation_claim.test.mjs` from the repository root.
Fixtures are synthetic; this experiment is not wired into the app or OCR and
does not modify the exact verifier, diagnoses, or grades.
