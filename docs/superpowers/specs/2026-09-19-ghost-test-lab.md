# Ghost Test Lab

Date: 2026-09-19

## Purpose

Use the already-existing Ghost students (nicknames such as Ghost01, Ghost02, etc., with no space) as reusable test accounts before real students enter YouTeach.

## Rules

- Do not create duplicate test students when Ghost students already exist.
- The lab discovers test accounts through the current multi-group membership model: a student counts as a Ghost when `FANTASMA` appears in `groupName` or active `groupMemberships`. It does not create duplicates. `studentNumber` uses `GHOST01`–`GHOST20`; `nickname` uses `FAKE-01`–`FAKE-20`.
- Test presence writes to the same `students` and `attendance` state used by the normal teacher screens.
- Test assignment PDFs are uploaded through the real `/api/drive-upload-session` flow and therefore appear in normal teacher grading.
- Test assignments must target `FANTASMA` or `ALL`; normal assignment group validation remains authoritative.
- Grades are not fabricated by the lab. The teacher reviews/grades/publishes in the normal Assignments screen, while the lab only reflects the live result.
- Buzzer simulation uses the same `session/current/buzzer` Firebase transaction used by the student buzzer screen.
- The lab is teacher-only and is accessed from Teacher Home.
- GitHub remains the source of truth; Cloudflare Pages deploys from `main`.

## Correction 2026-09-20

Canonical test identity: group `FANTASMA`; external IDs `GHOST01`–`GHOST20`; nicknames `FAKE-01`–`FAKE-20`. The lab must not identify these accounts by a `Ghost01` nickname because that field does not contain the Ghost ID.


## Selection UX rule

The Ghost list keeps individual row checkboxes and uses one master checkbox in the checkbox-column header. Checked selects all Ghost rows; unchecked clears all; partial selection displays the indeterminate state. This follows the project-wide list-selection rule in `docs/superpowers/README.md`.


## Correction 2026-10-13 — multi-group Ghost membership

- Ghost Test Lab must never require `student.groupName` to equal `FANTASMA` when the student has an active FANTASMA membership.
- Assignment eligibility checks must pass both `studentKey` and `student` to the recipient/group resolver.
- Inside Ghost Test Lab, attendance simulation and generated test PDFs use the FANTASMA test context rather than an unrelated primary group.
- The Ghost Lab script URL must be cache-busted when membership logic changes so production does not keep running a stale pre-multi-group bundle.
