# Ghost Test Lab

Date: 2026-09-19

## Purpose

Use the already-existing Ghost students (nicknames such as Ghost01, Ghost02, etc., with no space) as reusable test accounts before real students enter YouTeach.

## Rules

- Do not create duplicate test students when Ghost students already exist.
- The lab discovers Ghost accounts by the existing nickname format `Ghost01`, `Ghost02`, etc. (no space), and does not create duplicates.
- Test presence writes to the same `students` and `attendance` state used by the normal teacher screens.
- Test assignment PDFs are uploaded through the real `/api/drive-upload-session` flow and therefore appear in normal teacher grading.
- Test assignments must target each Ghost student's actual current group or `ALL`; the lab must not assume or hardcode a group name, and normal assignment group validation remains authoritative.
- Grades are not fabricated by the lab. The teacher reviews/grades/publishes in the normal Assignments screen, while the lab only reflects the live result.
- Buzzer simulation uses the same `session/current/buzzer` Firebase transaction used by the student buzzer screen.
- The lab is teacher-only and is accessed from Teacher Home.
- GitHub remains the source of truth; Cloudflare Pages deploys from `main`.
