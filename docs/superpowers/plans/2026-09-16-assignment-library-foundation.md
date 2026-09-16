# Assignment Library Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the reusable Assignment Template / Assigned Instance data boundary without changing the current teacher UX yet.

**Architecture:** Add a small pure-JavaScript model module that extracts only reusable academic content from an existing assignment, builds immutable template records, and creates new assigned-instance payloads with a frozen template snapshot. The existing Firebase `assignments` node remains the run-time assigned-instance store for compatibility; a later UI task will persist reusable templates under `assignmentTemplates`.

**Tech Stack:** Static ES modules, Firebase Realtime Database in the existing app, Node.js built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`

## Global Constraints

- GitHub is the source of truth; Cloudflare Pages deploys from GitHub.
- Reusable template content must stay separate from group/date/submission/grade state.
- Reusing a template must never copy prior student submissions, evidence, grades, publication state, or run-specific participation state.
- Editing a reusable template later must not rewrite historical assigned instances.
- Current assignment behavior and grading flows must remain compatible.
- No new Assignment Library UX is introduced in this foundation phase.

---

### Task 1: Define the reusable-template boundary with tests

**Files:**
- Create: `tests/assignment-library-model.test.mjs`
- Create: `assignment-library-model.js`

**Interfaces:**
- Produces: `extractReusableAssignmentContent(assignment)`
- Produces: `buildAssignmentTemplateRecord({ id, assignment, now, actor })`
- Produces: `buildAssignedInstanceFromTemplate({ template, code, groupName, dueAt, now, actor })`

- [ ] **Step 1: Write failing tests for reusable-content extraction**

Create tests that assert reusable fields survive while run-specific fields are absent:

```js
test('extractReusableAssignmentContent excludes assigned-instance state', () => {
  const reusable = extractReusableAssignmentContent({
    code: 'PJ-MODEL-G1-160926',
    title: 'Anatomical model',
    groupName: 'G1',
    dueAt: 1790000000000,
    active: false,
    instructions: 'Build the model',
    assignmentType: 'Project',
    assignmentTypeCode: 'PJ',
    evaluationCriteria: [{ id: 'c1', title: 'Form', maxPoints: 100 }],
    evaluationDistribution: 'manual',
    evaluationNotes: 'Teacher notes',
    assignmentSubmissions: { student1: { driveFileId: 'old-file' } },
    grading: { totalScore: 90 },
    gradePublished: true
  });

  assert.equal(reusable.title, 'Anatomical model');
  assert.equal(reusable.instructions, 'Build the model');
  assert.equal(reusable.assignmentTypeCode, 'PJ');
  assert.equal('code' in reusable, false);
  assert.equal('groupName' in reusable, false);
  assert.equal('dueAt' in reusable, false);
  assert.equal('active' in reusable, false);
  assert.equal('assignmentSubmissions' in reusable, false);
  assert.equal('grading' in reusable, false);
  assert.equal('gradePublished' in reusable, false);
});
```

- [ ] **Step 2: Write failing tests for project checkpoint cleanup**

The template may preserve reusable checkpoint content but must remove run-specific checkpoint dates:

```js
test('project checkpoint templates keep instructions but drop run-specific dates', () => {
  const reusable = extractReusableAssignmentContent({
    title: 'Project',
    projectCheckpoints: {
      cp1: {
        title: 'Draft',
        instructions: 'Upload progress',
        requiredEvidenceTypes: ['image'],
        reviewAt: 1790000000000,
        dueAt: 1790000000000
      }
    }
  });

  assert.deepEqual(reusable.projectCheckpoints.cp1.requiredEvidenceTypes, ['image']);
  assert.equal(reusable.projectCheckpoints.cp1.title, 'Draft');
  assert.equal('reviewAt' in reusable.projectCheckpoints.cp1, false);
  assert.equal('dueAt' in reusable.projectCheckpoints.cp1, false);
});
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```bash
node --test tests/assignment-library-model.test.mjs
```

Expected: FAIL because `assignment-library-model.js` does not exist yet.

- [ ] **Step 4: Implement minimal reusable-content extraction**

Create `assignment-library-model.js` with a deep-cloning helper and an explicit allowlist of reusable fields. Normalize tags and checkpoint content; never copy unknown runtime fields.

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```bash
node --test tests/assignment-library-model.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message:

```text
Add reusable assignment content model
```

---

### Task 2: Build durable Assignment Template records

**Files:**
- Modify: `tests/assignment-library-model.test.mjs`
- Modify: `assignment-library-model.js`

**Interfaces:**
- Consumes: `extractReusableAssignmentContent(assignment)`
- Produces: `buildAssignmentTemplateRecord({ id, assignment, now, actor })`

- [ ] **Step 1: Add failing template-record tests**

Tests must require:
- stable `id`;
- `schemaVersion: 1`;
- `version: 1`;
- `archived: false`;
- `usageCount: 0`;
- `createdAt` and `updatedAt` from the supplied deterministic clock;
- `createdBy` / `updatedBy`;
- reusable content only.

```js
test('buildAssignmentTemplateRecord creates a reusable versioned template', () => {
  const template = buildAssignmentTemplateRecord({
    id: 'tpl-1',
    assignment: {
      title: 'Respiratory system',
      groupName: '3A',
      dueAt: 1790000000000,
      instructions: 'Create a diagram'
    },
    now: 12345,
    actor: 'Teacher'
  });

  assert.equal(template.id, 'tpl-1');
  assert.equal(template.schemaVersion, 1);
  assert.equal(template.version, 1);
  assert.equal(template.archived, false);
  assert.equal(template.usageCount, 0);
  assert.equal(template.content.title, 'Respiratory system');
  assert.equal('groupName' in template.content, false);
  assert.equal('dueAt' in template.content, false);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/assignment-library-model.test.mjs
```

Expected: FAIL because the builder is missing.

- [ ] **Step 3: Implement the minimal template builder**

The builder must reject a missing id or empty title and must deep-clone its content.

- [ ] **Step 4: Run and verify GREEN**

```bash
node --test tests/assignment-library-model.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```text
Add versioned assignment template records
```

---

### Task 3: Create assigned instances from templates without historical contamination

**Files:**
- Modify: `tests/assignment-library-model.test.mjs`
- Modify: `assignment-library-model.js`

**Interfaces:**
- Consumes: `buildAssignmentTemplateRecord(...)`
- Produces: `buildAssignedInstanceFromTemplate({ template, code, groupName, dueAt, now, actor })`

- [ ] **Step 1: Add failing instance tests**

Require a run-time assignment payload that:
- receives `code`, `groupName`, `dueAt`, `active: true`, and existing Google Drive storage behavior;
- records `templateId` and `templateVersion`;
- embeds a deep-cloned `templateSnapshot`;
- copies reusable assignment content into the fields the existing app already consumes;
- never includes submissions, grades, publication state, or prior run state.

```js
test('buildAssignedInstanceFromTemplate creates a clean run with frozen snapshot', () => {
  const template = buildAssignmentTemplateRecord({
    id: 'tpl-1',
    assignment: { title: 'Respiratory system', instructions: 'Create a diagram' },
    now: 100,
    actor: 'Teacher'
  });

  const instance = buildAssignedInstanceFromTemplate({
    template,
    code: 'CT-RESP-G1-160926',
    groupName: 'G1',
    dueAt: 200,
    now: 150,
    actor: 'Teacher'
  });

  assert.equal(instance.templateId, 'tpl-1');
  assert.equal(instance.templateVersion, 1);
  assert.equal(instance.code, 'CT-RESP-G1-160926');
  assert.equal(instance.groupName, 'G1');
  assert.equal(instance.dueAt, 200);
  assert.equal(instance.title, 'Respiratory system');
  assert.equal(instance.active, true);
  assert.equal(instance.storageProvider, 'google-drive');
  assert.equal('grading' in instance, false);
  assert.equal('gradePublished' in instance, false);
});
```

Also mutate `template.content` after instance creation and assert `instance.templateSnapshot` does not change.

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/assignment-library-model.test.mjs
```

Expected: FAIL because the instance builder is missing.

- [ ] **Step 3: Implement minimal instance builder**

Validate `template`, `code`, `groupName`, and finite `dueAt`. Return only clean run fields plus the reusable content and frozen snapshot.

- [ ] **Step 4: Run focused and existing regression tests**

```bash
node --test tests/assignment-library-model.test.mjs
node --test tests/grading-workflow.test.mjs tests/project-checkpoints.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```text
Create clean assigned instances from templates
```

---

### Task 4: Document the foundation and prepare the next integration slice

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`
- Modify: `docs/superpowers/specs/2026-09-15-youteach-continuity-roadmap.md`

**Interfaces:**
- Consumes: the pure model from Tasks 1-3.
- Produces: a precise next-step record for Firebase persistence and Assignment Library UX.

- [ ] **Step 1: Record implementation status**

Document that the pure Template/Instance boundary is implemented but not yet wired to the teacher UI or Firebase `assignmentTemplates`.

- [ ] **Step 2: Record the next integration slice**

The next slice will:
- persist templates under `assignmentTemplates/{templateId}`;
- add explicit teacher actions to save/reuse a template;
- create a new entry in the existing `assignments` node from a template;
- increment template `usageCount` only when a new assigned instance is successfully created;
- preserve historical instances through `templateSnapshot`.

No visual layout is to be invented until the relevant Assignment Library UX is reviewed.

- [ ] **Step 3: Commit**

```text
Document Assignment Library foundation status
```

---

## Self-review

- Spec coverage: this plan implements the foundational Template vs Assigned Instance boundary and historical snapshot requirement; it intentionally defers archive/search/filter/summary-performance UX and Firebase persistence to a later integration slice.
- Placeholder scan: no TBD/TODO/placeholder steps.
- Type consistency: all tasks use the same three exported functions and the same `template.content` / `templateSnapshot` model.
- Scope control: no unapproved Assignment Library page/layout is introduced.
