# Ghost Test Lab

Date: 2026-09-19

## Purpose

Use the already-existing Ghost students (nicknames such as Ghost01, Ghost02, etc., with no space) as reusable test accounts before real students enter YouTeach.

## Rules

- Do not create duplicate test students when Ghost students already exist.
- The lab discovers test accounts by exact `groupName === "FANTASMA"` and does not create duplicates. `studentNumber` uses `GHOST01`–`GHOST20`; `nickname` uses `FAKE-01`–`FAKE-20`.
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

The Ghost list keeps individual checkboxes and must also expose separate visible `Select all` and `Deselect all` controls. This follows the project-wide list-selection rule in `docs/superpowers/README.md`.
