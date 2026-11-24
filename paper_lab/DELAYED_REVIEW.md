# Optional next-day review

After the confirmed distribution workflow and a correct immediate practice response
(with or without an immediate hint), the learner can opt to save one review. The
new exercise stays out of the rendered interface until 24 hours after opting in.
Reopen the same browser and local origin then, or use the check button. There is
no background notification, account, or server-side review record.

The first parseable expression locks a result before the interface shows feedback.
Malformed input can be re-entered; an equivalent but unfinished response stays
recorded as unfinished. It is not overwritten by a correction or page reload.
The prototype stores only an item identifier, schema version, due timestamp, and
outcome on that browser. Delete saved review removes that record; Clear in the
photo panel instead clears the current paper. Deleting browser data or explicitly
resetting the review also removes its attempt history; a known item cannot be
treated as new evidence after a reset. The client clock and profile are not
tamper-proof, and simultaneous tabs are not transactionally locked.

When another same-origin tab changes the saved review or clears local browser
storage, this page refreshes from the current record and discards any unsubmitted
review answer without moving focus. Changes to other keys or session storage do
not disturb that draft. This sync does not make concurrent submissions atomic.

The fixed-clock tests show gating and recording mechanics. This is a new example
of the same algebra skill, not a measured improvement in retention or an exam
result. No real student data was used.
