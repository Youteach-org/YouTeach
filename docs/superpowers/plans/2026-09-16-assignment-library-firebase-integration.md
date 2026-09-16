# Assignment Library Firebase Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist reusable assignment templates in Firebase and let the existing Teacher Assignments form save and reuse them without introducing a separate library page.

**Architecture:** Keep `assignments` as the assigned-instance store and add `assignmentTemplates` as the reusable source store. The current Create Assignment form gains a minimal template selector/loader; saving a selected assignment creates a template record, and creating from a loaded template writes a clean instance plus template usage metadata atomically.

**Tech Stack:** Static HTML/ES modules, Firebase Realtime Database 10.12.2, Node built-in tests.

**Spec:** `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`

## Global Constraints

- No separate Assignment Library page/layout in this slice.
- Never copy submissions, grades, publication state, group, or due date into a template.
- New assigned instances remain in `assignments`.
- Reusable templates live under `assignmentTemplates/{templateId}`.
- Historical instances keep `templateId`, `templateVersion`, and a frozen effective-content snapshot.
- Template usage increments only when the assigned instance write succeeds.

---

### Task 1: Lock the Firebase/UI contract with a failing integration test

**Files:**
- Create: `tests/assignment-library-integration.test.mjs`

**Required assertions:**
- Teacher Assignments imports the model builders.
- HTML contains `saveSelectedTemplateBtn`, `assignmentTemplateSource`, and `loadAssignmentTemplateBtn`.
- Teacher JS subscribes to `assignmentTemplates`.
- Teacher JS has save/load template handlers.
- Creating from a loaded template writes `templateId`, `templateVersion`, `templateSnapshot`.
- Template usage and assignment creation are committed through one root Firebase `update`.

Run `node --test tests/assignment-library-integration.test.mjs` and verify RED before implementation.

### Task 2: Persist and load templates through the existing Create Assignment form

**Files:**
- Modify: `teacher-assignments.html`
- Modify: `teacher-assignments.js`

**Behavior:**
- Add a compact template selector at the top of the existing create form.
- Add “Save selected as template” to the existing Actions menu.
- Saving uses `buildAssignmentTemplateRecord` and writes to `assignmentTemplates/{pushKey}`.
- Loading a template fills reusable academic fields only; group and due date remain run-specific.
- Project checkpoint rows load without dates so new review dates must be chosen for the new run.
- Creating after loading a template uses the current form content as the frozen instance snapshot while preserving source `templateId` and `templateVersion`.
- Use a root multi-location Firebase update so assignment creation and usage-count increment succeed together.

### Task 3: Verify regressions and document status

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`
- Modify: `docs/superpowers/specs/2026-09-15-youteach-continuity-roadmap.md`

**Verification:**
- `node --test tests/assignment-library-model.test.mjs tests/assignment-library-integration.test.mjs`
- structural regression checks for grading/project features;
- `node --check assignment-library-model.js`.

Document Firebase/UI integration as implemented on the feature branch, with archive/search/filter/statistics still deferred.
