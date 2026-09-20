# Ghost Test Lab

Date: 2026-09-19

## Purpose

Use the already-existing Ghost students as reusable test accounts before real students enter YouTeach.

## Rules

- Do not create duplicate test students when Ghost students already exist.
- The lab discovers test accounts by exact `groupName === "FANTASMA"` and does not create duplicates.
- Canonical external IDs / student numbers are `GHOST01`–`GHOST20`.
- Canonical nicknames are `FAKE-01`–`FAKE-20`.
- Test presence writes to the same `students` and `attendance` state used by the normal teacher screens.
- Test assignment PDFs are uploaded through the real `/api/drive-upload-session` flow and therefore appear in normal teacher grading.
- Test assignments must target `FANTASMA` or `ALL`; normal assignment group validation remains authoritative.
- Grades are not fabricated by the lab. The teacher reviews/grades/publishes in the normal Assignments screen, while the lab only reflects the live result.
- Buzzer simulation uses the same `session/current/buzzer` Firebase transaction used by the student buzzer screen.
- The lab is teacher-only and is accessed from Teacher Home.
- GitHub remains the source of truth; Cloudflare Pages deploys from `main`.

## Correction 2026-09-20

Canonical test identity:
- group: `FANTASMA`;
- external IDs: `GHOST01`–`GHOST20`;
- nicknames: `FAKE-01`–`FAKE-20`.

The lab must not identify these accounts by a `Ghost01` nickname because that field does not contain the Ghost ID.

## Selection UX rule

The Ghost list keeps individual row checkboxes and uses one master checkbox in the checkbox-column header. Checked selects all Ghost rows; unchecked clears all; partial selection displays the indeterminate state. This follows the project-wide list-selection rule in `docs/superpowers/README.md`.

## Authentication-testing distinction — 2026-09-20

Ghost Test Lab is a teacher-side simulator, not twenty independent authenticated browser sessions.

The simulator may:
- mark Ghost students active/inactive;
- create attendance state;
- submit generated test PDFs;
- withdraw submissions;
- simulate buzzer transactions.

Those actions do **not** prove the hardened Student Login path works.

For authentication and secure COG validation, use a complementary real-login test:
1. use at least one existing Ghost account, preferably external ID `GHOST01`;
2. sign in through the normal Student login using the server-authoritative auth path;
3. launch an assigned COG/Verb Runner task from YouTeach;
4. verify assigned mode/difficulty are locked;
5. complete the run;
6. use Send to teacher;
7. verify official result/points on the teacher side;
8. test Undo Submission and resubmission.

Mass Ghost Test Lab simulation and real Ghost login are separate test modes and both are required before production cutover.

## Credential-migration rule — 2026-09-20

Do not use Ghost Test Lab as justification to migrate or delete all real-student credentials.

Before production migration:
- provision isolated preview auth storage;
- test teacher auth in preview;
- test at least one Ghost through real Student login;
- test the full COG official-result loop;
- confirm Ghost Test Lab mass simulation still works.

Real-student credential migration happens only after those gates pass.
