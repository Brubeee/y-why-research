# Explicit operation claims: optional Paper Lab checks

The exact solution-set verdict and a student's declared action are different
checks. `verifyRows()` remains authoritative. Claim checks can describe how a
written transition compares with an explicitly selected operation; they never
upgrade, downgrade, or replace the math verdict, and they do not establish what
the student intended.

## Existing expansion check

The optional “What if I only expanded the left bracket?” check remains scoped
to a confirmed equivalent transition with a small signed-integer multiplier
and two-term left bracket. It recognizes both standard term orders, requires
the right side to remain as written, and distinguishes expanded, unfinished,
and right-side-rewritten forms.

## Typed changed-step conversation

When a confirmed typed chain reaches its first solution-changing row and the
authored negative-distribution retry does not apply, the fallback asks “What
operation did you apply here?” The student can select add, subtract, multiply,
divide, or “Something else / Not sure,” then enter an exact constant for the
four supported operations. No free-text explanation is guessed or classified.

`checkTwoSidedOperationClaim()` applies the declared operation separately to
each side of the exact preceding line and compares both results with the
written next line using the same exact affine parser in `verify.mjs`. It
accepts equivalent forms and exact fractions without floating point. A side
gets a targeted prompt only when that comparison is supported exactly. If the
left matches, a right-side mismatch can point to that side; otherwise the
left is checked first. Unsupported notation, invalid constants, zero
multipliers/divisors, or “Something else / Not sure” do not produce a guessed
side diagnosis; the fallback asks for an intermediate equation or abstains.

This interaction is typed-only. The existing negative-distribution retry
keeps priority and is unchanged. Equivalent, unsupported, unconfirmed, and
unresolved-prefix chains do not open this conversation. Any typed edit,
reconfirmation, or change to the declared action clears stale operation
feedback.

## Reproducibility

- Focused tests: `node --test paper_lab/operation_claim.test.mjs`
- Frozen synthetic benchmark: `node paper_lab/operation_conversation_bench.mjs`
- Frozen inputs and scoring definitions: `paper_lab/OPERATION_CONVERSATION.md`

All cases are synthetic. The deterministic counts are not learner evidence or
evidence of educational effectiveness.
