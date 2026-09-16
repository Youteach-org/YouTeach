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
- manual grades preserved when the same submission revision is already manually graded;
- teacher Publish / Unpublish control on submission cards;
- student side shows only published numeric grades/feedback;
- student assignment cards expand in the grid to show full instructions/details;
- student grade display refreshes live after teacher publication;
- manual grading supports linked criterion points and percentages, with points constrained by criterion maximum.

Planned, not yet implemented:
- full grading-history/audit trail across revisions;
- Project review checkpoints with photo/video/document evidence uploads;
- exam PDF/image annotation with ✓/✗ and per-question marks;
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
6. Teacher reviews the AI result.
7. If correct, teacher publishes/releases it.
8. If incorrect, teacher opens that student's card and enters a manual grade; the manual grade becomes the current internal grade.
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

Manual correction should:
- replace the current internal grade;
- preserve grading history/audit information;
- remain unpublished until teacher publication unless a future explicit setting says otherwise.

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

For exams, the teacher should be able to see visually which parts were correct or incorrect inside an annotated derivative of the submitted PDF/image.

Accepted direction:
- preserve the original submission unchanged;
- generate a separate annotated copy;
- use clear marks such as ✓ and ✗;
- where useful include points/comments;
- keep annotation data tied to question number/page;
- store the annotated file in Drive alongside the original or in a clearly defined grading-output location.

Suggested naming:
`{original-base}--graded.pdf`

For exams produced by Exam Creator / Answer Sheet Creator, the system should know exact question/response regions, making annotation more reliable.

The grading JSON should eventually support per-question annotation metadata so the visual graded copy and numeric score come from the same grading record.

## 5. Project assignments with progress tracking

Project assignments need a milestone/checkpoint model instead of only one final PDF.

Teacher can define review dates/checkpoints.

Each checkpoint can contain:
- checkpoint title;
- review/due date;
- instructions;
- required evidence types;
- optional teacher notes;
- completion/review status.

Student can submit progress evidence such as:
- photos/images;
- video;
- PDF/document evidence;
- other approved file types added later.

Project evidence is additive across checkpoints and should not overwrite prior checkpoint history.

Recommended Drive organization for Project assignments:
- task folder;
- student subfolder;
- checkpoint/review subfolders or equivalent structured metadata.

The teacher should see a timeline of progress and be able to review each checkpoint.

The final project submission remains distinct from interim progress evidence.

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

The card should make the current grade visible to the teacher even when unpublished.

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
