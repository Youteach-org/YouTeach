# Clear Manual Grade

Date: 2026-09-16
Repository: youteachtk/YouTeach
Status: implemented

## Decision

A teacher can reset a saved manual grade directly from the student's submitted-work card or from the student's Manual Grading panel.

Behavior:
- the control is named **Clear grade**;
- it is visible directly on the submitted-work card and inside Manual Grading when the current saved grading mode is manual;
- confirmation is required before applying it;
- the student's submitted file remains unchanged;
- the current manual score and feedback are cleared;
- any published state is turned off;
- the submission returns to pending grading;
- grading-source sync markers are reset so the same submission may be graded again manually or with AI;
- identity-review information remains unchanged because it belongs to the submission rather than the grade.

## Implementation

Current implementation:
- `teacher-assignments.js`
- `teacher-assignments.html`

The reset must never remove the student's Drive submission.
