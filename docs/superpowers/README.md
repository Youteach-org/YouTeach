# YouTeach Superpowers continuity index

Repository: `youteachtk/YouTeach`
Canonical branch: `main`
Production flow: GitHub -> Cloudflare Pages

## Purpose

This folder is the canonical continuity layer for YouTeach.

Any future ChatGPT/Codex/Superpowers instance working on this repository should read this index first, then the linked specs, before making product or architecture changes.

GitHub is the source of truth. Chat memory is secondary.

## Required reading order

1. `docs/superpowers/specs/2026-09-15-youteach-continuity-roadmap.md`
   - current roadmap;
   - accepted product/architecture decisions;
   - implementation order;
   - current next action.

2. `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`
   - reusable Assignment Template vs Assigned Instance;
   - Assignment Library;
   - course/topic analytics;
   - Course Intelligence / Program Builder direction;
   - manual Exam Bank;
   - Administration.

3. `docs/superpowers/specs/2026-09-16-grading-project-evidence-student-ux.md`
   - canonical AI grade -> teacher review -> publish workflow;
   - exact evidence-type grading rules;
   - duplicate-grading ledger/idempotency;
   - exam annotations;
   - Project checkpoints with photo/video/document evidence;
   - expanded student assignment cards;
   - manual points/percentage grading;
   - published student grades.

4. `docs/superpowers/specs/2026-09-16-clear-manual-grade.md`
   - direct Clear grade behavior;
   - grade reset without deleting the student's submission;
   - regrading after reset.

5. `docs/superpowers/specs/2026-09-19-ghost-test-lab.md`
   - reusable Ghost student test accounts;
   - simulated attendance/presence;
   - real assignment submission and grading verification;
   - Buzzer simulation.

6. Relevant implementation files and recent commits on `main`.
   - UI micro-decisions that are already implemented are authoritative in code/commit history even when not repeated word-for-word in a spec.

## Continuity rules

1. Material decisions must be written to GitHub.
2. Product decisions, architecture rules, data-model decisions, workflow rules, and accepted UX behavior belong in `docs/superpowers/specs/`.
3. Small implementation details and visual corrections may live in code plus commit history, but any change that affects future design choices must also update a spec.
4. Do not rely on a previous chat being available.
5. Do not silently reverse an accepted decision. If a decision changes, update the relevant spec and explain the replacement.
6. GitHub changes happen first; Cloudflare deploys from GitHub.
7. Keep YouTeach and Classroom Online Games as separate repositories. Integrate through explicit contracts.
8. Reusable content must remain separate from historical student instances/data.
9. Never copy prior submissions/grades into a reused Assignment instance.
10. The approved exam-library feature is the manual Exam Bank; internal Question Bank / Exam Creator / Answer Sheet Creator are not approved scope.
11. External AI exam creation/rearrangement is outside the Exam Bank and must be designed separately.
12. Admin is a separate role-aware section from Teacher.
13. Current project terminology should stay consistent with the specs.

## Current high-level sequence

1. Field-validate AI grading -> teacher review -> publish on real tasks.
2. Stabilize responsive behavior across desktop/tablet/mobile.
3. Add Assignment Template / Assigned Instance model.
4. Build Assignment Library.
5. Add Course -> Unit -> Topic -> Subtopic metadata.
6. Add analytics foundation.
7. Build the manual Exam Bank.
8. Build Administration.
9. Harden authentication and finish Cloudflare/infrastructure cleanup.
10. Build Course Intelligence / Program Builder when historical data is sufficient.

## How another instance should continue

When asked to continue YouTeach:

1. Read this file.
2. Read the current specs above.
3. Inspect recent commits on `main`.
4. Check the current implementation before proposing duplicate work.
5. Continue from the roadmap's "Current next action".
6. When a new material decision is made, update GitHub before ending the work session.

## Source-of-truth summary

- Repository: `youteachtk/YouTeach`
- Branch: `main`
- Hosting: Cloudflare Pages
- Database/live state: Firebase Realtime Database
- Assignment evidence: Google Drive
- Canonical project continuity: `docs/superpowers/`
