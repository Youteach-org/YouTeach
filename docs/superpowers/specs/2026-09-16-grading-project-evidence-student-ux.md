# Grading workflow, evidence rules, project tracking, and student assignment UX

Date: 2026-09-16
Repository: youteachtk/YouTeach
Status: accepted product decisions

## 0. Implementation status

Implemented on `main`, pending field validation:
- stronger evidence-first AI grading prompt;
- grading-results JSON schema v2 prompt with Drive source metadata;
- automatic polling/import of fresh AI grading results after launching AI Grading;
- AI grades saved internally as unpublished;
- conflict selector removed from the normal workflow;
- idempotent import protection for already-applied result/submission revisions;
- current-grade ownership follows the latest deliberate grading action: a newer AI result may replace an older manual grade, while a later manual correction takes control again;
- teacher Publish / Unpublish control on submission cards;
- student side shows only published numeric grades/feedback;
- student assignment cards expand in the grid to show full instructions/details;
- student grade display refreshes live after teacher publication;
- manual grading supports linked criterion points and percentages, with points constrained by criterion maximum;
- grading-history/audit trail across revisions, including AI application, manual correction, publication/unpublication, grade clearing, source submission revision metadata, and a baseline view for grades that predate the history feature;
- Project review checkpoints with photo/video/document evidence uploads, additive Drive storage, student progress view, and teacher review state;
- exam PDF annotation first version for EX assignments: page-level ✓/✗/note marks, question/points/comments, persistent annotation metadata, separate --graded.pdf derivative in Drive, student access gated by grade publication, and annotation invalidation on resubmission.

Planned, not yet implemented:
- richer grading ledger fingerprinting using Drive modified-time/size through all layers;
- bulk grade publication controls.

## 1. Canonical grading workflow

The normal workflow is intentionally simple.

1. Teacher chooses **AI Grading** for an assignment.
2. ChatGPT grades the eligible submissions using the exact assignment instructions and rubric.
3. Results are written to the task folder grading ledger:
   `{TASK-CODE}--grading-results.json`
4. The AI grade is applied internally to YouTeach and appears in the teacher submission card.
5. The result is **not published to the student automatically**.
6. Teacher reviews the AI result directly on the student's submitted-work card, where the numeric AI grade must be clearly visible.
7. If correct, the teacher may leave the AI grade as the current internal grade and publish/release it when ready.
8. If incorrect, the teacher opens Manual Grading from that same card and takes control of the score; saving the manual grade becomes the current internal grade.
9. Teacher then publishes when satisfied.

There is no normal Keep Manual / Compare / Replace decision before importing AI results. That selector created unnecessary ambiguity and is deprecated.

The data model should keep separate dimensions:
- grading status;
- grading mode (AI/manual);
- teacher review state;
- publication state.

Recommended fields:
- `grading.mode = "ai" | "manual"`
- `reviewStatus = "ai-graded" | "manual-graded" | "manual-review" | ...`
- `teacherReviewStatus = "pending" | "accepted" | "corrected"`
- `gradePublished = true | false`
- `gradePublishedAt`
- `gradePublishedBy`

AI grading should default to:
- internal grade saved;
- teacherReviewStatus = pending;
- gradePublished = false.

Current-grade ownership:
- AI Grading is an explicit teacher action; when its new result is newer than the current manual grade, that AI result becomes the current internal grade;
- if the teacher then opens Manual Grading and saves a correction, the newer manual grade becomes the current internal grade;
- returning to Teacher Assignments must automatically apply a pending explicit AI run once its fresh grading-results file appears;
- this avoids a hidden older manual grade blocking a newly requested AI evaluation.

Manual correction should:
- replace the current internal grade;
- preserve grading history/audit information;
- remain unpublished until teacher publication unless a future explicit setting says otherwise.


### 1.1 Grading history / audit trail

Each submission keeps an append-only `gradingHistory` map. A history event records:
- action type (`ai-grade-applied`, `manual-grade-saved`, `grade-published`, `grade-unpublished`, or `grade-cleared`);
- timestamp and actor;
- previous and next grading snapshots;
- previous and next publication state;
- source Drive file ID and source submission upload timestamp;
- for AI events, grading-results modified time and explicit AI action start time.

The current `grading` object remains the active grade. History does not control the current grade; it is an audit record.

Teacher submission cards expose the history in a collapsible `Grade history` section. Existing grades created before this feature are shown as a non-destructive current-grade baseline until the first stored history event exists.

Grade mutation and its history event must be written in one Firebase multi-location update so they cannot diverge.

## 2. AI grading prompt rules

AI must follow the assignment's own instructions and evaluation criteria literally before applying general assumptions.

### 2.1 Evidence-first grading
For each criterion, first determine:
1. what the instructions require;
2. what evidence type proves that requirement;
3. where that evidence appears in the submission;
4. whether the evidence actually satisfies the requirement.

Do not substitute a different evidence type.

Example:
If the assignment requires a physical **maqueta/model** and the instructions require visual proof, a drawing, diagram, schematic, rendering, or written description is not automatically equivalent to a photograph of the physical model.

The AI must inspect all pages/images/evidence before deciding the required evidence is absent.

### 2.2 Missing evidence vs not-gradable
These are different cases.

**Missing required component:**
If the assignment explicitly requires a component/evidence and the submitted work omits it, this is normally gradable as failure to meet that requirement according to the rubric, potentially including zero when justified.

**Not gradable from available modality:**
Use `not-gradable` only when the criterion itself cannot be judged fairly from the submitted modality/evidence, such as pronunciation when no audio exists and the assignment did not provide usable audio evidence.

Do not use `not-gradable` merely to avoid scoring a missing required component.

### 2.3 Evidence references
Each graded criterion should support a short evidence note when possible:
- page number;
- image/photo reference;
- answer/question number;
- short evidence description.

Future schema may store:
- `evidenceRefs`
- `page`
- `questionNumber`
- annotation coordinates when available.

### 2.4 No silent substitution
The AI must not:
- evaluate a drawing when the requirement is a physical-model photograph;
- evaluate text instead of required audio/video;
- infer completion of an unseen component;
- award credit for evidence from outside the task folder unless explicitly instructed.

## 3. Grading ledger / avoiding duplicate grading

### 3.0 Drive ownership rule for AI results

YouTeach uses the Google Drive `drive.file` scope. Therefore:
- YouTeach must create `{TASK-CODE}--grading-results.json` itself inside the task folder;
- ChatGPT must update that existing file in place and must not create a second file with the same name;
- preserving the same Drive file ID lets YouTeach read the result without requesting broader Drive permissions;
- the file is initialized as an empty schema-v2 placeholder when the task folder/grading support files are prepared;
- if an older task has no YouTeach-owned results file, the sync endpoint creates the placeholder and waits for AI to update it.

Root cause found on 2026-09-16:
- ChatGPT had created the results file with a different app context;
- YouTeach's `drive.file` OAuth token could see the task folder and its own rubric file but could not see that ChatGPT-created results file;
- production sync therefore returned 404 even though the file was visible to the teacher in Drive;
- the architecture was changed to precreate the results file from YouTeach and have AI update it.

Critical idempotency rule:
- Never treat an AI result as already applied when the submission has no current AI grade.
- Source/revision markers alone are not enough to skip import; a valid current AI grade must also exist.
- Passive/automatic AI sync errors must be visible to the teacher instead of failing silently.

Do not rename student submission files just to mark them graded.

The grading-results JSON should act as the durable grading ledger.

Each result should evolve to include source identity such as:
- `driveFileId`
- `driveFileName`
- `sourceModifiedTime`
- `sourceSize`
- `gradedAt`
- grading schema/revision

Before regrading, compare the current source file with the previous ledger entry.

If file ID + modification fingerprint is unchanged and a valid result already exists:
- do not grade it again by default;
- report it as already graded/skipped.

If the student resubmits or the file changes:
- treat it as a new grading revision;
- preserve the old grading history;
- grade the changed submission.

Firebase/YouTeach should also store which submission revision the current grade belongs to.

## 4. Exam grading annotations

Implemented first version on `main` for assignment type `EX`.

Teacher workflow:
- open **Annotate exam** from a submitted-student card;
- render the original submitted PDF in YouTeach with PDF.js;
- choose ✓ Correct, ✗ Wrong, or Note;
- click the page to place a mark;
- optionally attach question number, points, and a short comment;
- navigate pages, undo the last mark, clear one page, or remove individual marks;
- save the annotated derivative.

Data model:
- annotation metadata is stored on the submission under `examAnnotations`;
- each annotation stores page, normalized x/y coordinates, type, question, points, comment, timestamp, and teacher;
- `examAnnotationPointsTotal` stores the sum of entered per-question points for reference;
- annotation points do not silently replace the current grading object.

PDF handling:
- the original Drive submission is read through a YouTeach Cloudflare endpoint and is never modified;
- pdf-lib generates a derivative copy;
- Drive naming uses `{original-base}--graded.pdf`;
- a later save updates the derivative rather than the original submission;
- the teacher card links to the graded derivative.

Publication:
- the student cannot retrieve the annotated derivative before `gradePublished=true`;
- once the teacher publishes a numeric grade, the expanded student assignment card exposes **Open graded exam PDF**;
- the student endpoint revalidates student identity and publication state before streaming the derivative.

Revision safety:
- a replacement submission invalidates/removes stale exam annotation metadata and the prior derivative;
- a resubmission or withdrawal clears the current grade/publication state and records the prior grade in grading history as a previous revision;
- Undo Submission removes both the original submitted file and any annotated derivative.

Current first-version limitation:
- annotations are manually positioned because Exam Creator / Answer Sheet Creator regions are not implemented yet;
- when that shared exam schema exists, question/response coordinates should replace manual positioning where possible.

## 5. Project assignments with progress tracking

Implemented first version on `main`.

Project assignments use a milestone/checkpoint model in addition to the final PDF.

Teacher can define checkpoints while creating a `PJ` assignment. Each checkpoint stores:
- checkpoint title;
- review/due date;
- instructions;
- required evidence types (`image`, `video`, `document`);
- creation timestamp.

Student can submit additive progress evidence such as:
- photos/images;
- video;
- PDF/Office/text document evidence.

Project evidence is stored separately from `assignmentSubmissions` under:
`assignmentProjectEvidence/{assignmentId}/{studentKey}/{checkpointId}/{evidenceId}`

Evidence does not overwrite prior checkpoint evidence and never replaces or mutates the final PDF submission.

Drive organization:
- task folder;
- student folder;
- checkpoint folder;
- timestamped evidence files.

Teacher assignment detail shows a Project progress timeline across students and checkpoints. Each evidence file can be opened from Drive and marked Reviewed / reopened, with an optional teacher note.

Student expanded assignment cards show:
- checkpoint title/instructions;
- checkpoint due date and open/closed state;
- accepted evidence types;
- prior evidence files;
- teacher review status and teacher note;
- upload control for additional evidence while the checkpoint is open.

Current limits for the first version:
- photo/document evidence: up to 20 MB per file;
- video evidence: up to 50 MB per file;
- checkpoint configuration is created with the project assignment; a dedicated post-creation checkpoint editor is a later enhancement.

## 6. Student assignment card expansion

Student My Assignments remains a compact grid by default.

When a student clicks an assignment card:
- that card expands substantially in place;
- it shows the complete assignment/instructions, not a two-line truncation;
- upload/evidence controls and current status are fully visible;
- neighboring cards reflow around the expanded card rather than opening a disconnected page/modal where possible;
- on smaller screens the expanded card may occupy the full grid width.

Clicking the selected card again or another assignment returns/reflows the grid appropriately.

## 7. Manual grading input

For every criterion:
- direct points input is limited to 0 through that criterion's configured maximum;
- invalid values cannot be saved;
- UI should constrain the input, not rely only on post-save validation.

Add a linked percentage option:
- percentage range 0-100%;
- computed points = criterionMaxPoints * percentage / 100;
- changing percentage updates points;
- changing points updates percentage;
- stored canonical value remains the criterion point score.

Example:
criterion max = 20 points;
75% => 15 points.

## 8. Student grade visibility

Student side should support viewing published grades.

Before publication:
- the student may see submission/review status;
- the numeric grade and detailed teacher/AI feedback remain hidden.

After publication:
- show total grade /100;
- show criterion breakdown;
- show released feedback;
- show published date where useful.

Teacher publication is explicit.

Future options:
- publish one student's grade;
- publish all reviewed grades for an assignment;
- unpublish/correct with audit history if needed.

## 9. Teacher submission card states

Teacher cards should distinguish at least:
- Submitted / not graded
- AI graded / teacher review pending / unpublished
- Manual grade / unpublished
- Published
- Manual review required
- Identity mismatch/manual review

The card should make the current grade prominently visible to the teacher even when unpublished.

Teacher-card interaction rule:
- clicking a submitted-student card opens its Manual Grading panel;
- clicking the same card again hides that panel;
- do not add a separate Close button for card-expanded/detail panels;
- when the current grade is AI, the card should expose a clear Manual Grading takeover action;
- returning to/focusing Teacher Assignments should automatically check for the latest AI results so a completed AI grade appears on the card without requiring a separate sync workflow.

## 10. Implementation sequence

Immediate:
1. strengthen the AI grading prompt;
2. simplify AI application workflow and remove conflict-selector ambiguity;
3. add unpublished/published grade state;
4. add teacher publish action;
5. show published grades on student side;
6. improve manual grading inputs with point/percentage linkage;
7. add expanded student assignment card behavior.

Next:
8. add grading ledger idempotency/revision fingerprinting;
9. add Project checkpoint/evidence data model and file upload support;
10. add exam annotation schema and annotated derivative generation.

## 11. Continuity rules

Future instances must preserve:
- AI grades apply internally first and are unpublished by default;
- teacher review/publication is separate from grading;
- manual correction is performed from the student's grading card;
- assignment instructions control evidence requirements;
- evidence types are not interchangeable unless the assignment says so;
- original student submissions are preserved;
- duplicate grading should be prevented using source revision/fingerprint data, not filename renaming;
- published student grades must never expose unpublished teacher/AI review data.


## Manual grading input order — 2026-09-20

For each rubric criterion in Manual Grading:
- show the **percentage input first (left)**;
- show the resulting **criterion points second (right)**;
- entering a percentage computes the awarded points from that criterion's maximum;
- entering points may continue to back-calculate the percentage;
- the purpose of the left-first percentage control is to let the teacher decide, for example, 50% of a criterion before seeing/applying the resulting point value.
