import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const createHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');
const createJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');
const teacherJs = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const teacherHtml = readFileSync(join(root, 'teacher-assignments.html'), 'utf8');
const runtimeJs = readFileSync(join(root, 'group-grade-runtime.js'), 'utf8');
const targetJs = readFileSync(join(root, 'assignment-evaluation-target.js'), 'utf8');
const createModuleJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');
const createModuleHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');

test('Create Assignment requires an explicit block or unit', () => {
  assert.match(createHtml, /id="assignmentEvaluationBlock"/);
  assert.match(createHtml, /Block \/ Unit/);
  assert.match(createJs, /if \(!evaluationBlock\) return setStatus\("Select the block \/ unit for this assignment\."/);
  assert.match(createJs, /evaluationBlock,/);
});

test('Create Assignment requires a criterion for non-exams and exempts exams', () => {
  assert.match(createHtml, /Required for every assignment except exams/);
  assert.match(createJs, /if \(typeCode !== "EX" && !groupCriterion\)/);
  assert.match(createJs, /groupEvaluationCriterionId: groupCriterion\?\.id \|\| ""/);
  assert.match(targetJs, /mode: exam \? "exam" : "assignment"/);
});

test('Create Assignment persists the canonical target plus legacy compatibility fields', () => {
  assert.match(createJs, /evaluationTarget: buildAssignmentEvaluationTarget/);
  assert.match(createJs, /evaluationTargets:/);
  assert.match(createJs, /\[groupName\]: buildAssignmentEvaluationTarget/);
  assert.match(createJs, /assignmentCriterionDefaults/);
});

test('AI graded legacy assignments are backfilled into explicit evaluation targets', () => {
  assert.match(teacherJs, /migrateAiGradedAssignmentEvaluationTargets/);
  assert.match(teacherJs, /legacyAssignmentMigrationTarget/);
  assert.match(teacherJs, /evaluationTargetMigratedAt/);
  assert.match(teacherJs, /evaluationTargetNeedsReview/);
  assert.match(teacherJs, /scheduleAssignmentEvaluationMigration/);
});

test('grade runtime reads the canonical evaluation target model', () => {
  assert.match(runtimeJs, /evaluationTargetForAssignment/);
  assert.match(runtimeJs, /assignmentTarget\(assignment\)\.criterionId/);
});


test('Assignment Browser shows block and criterion on every assignment card', () => {
  assert.match(teacherHtml, /id="assignmentFilterBlock"/);
  assert.match(teacherHtml, /id="assignmentFilterCriterion"/);
  assert.match(teacherJs, /evaluationTargetForAssignment/);
  assert.match(teacherJs, /assignment-target-block/);
  assert.match(teacherJs, /assignment-target-criterion/);
});

test('Assignment Browser filters by canonical block and criterion targets', () => {
  assert.match(teacherJs, /assignmentFilterBlock/);
  assert.match(teacherJs, /assignmentFilterCriterion/);
  assert.match(teacherJs, /blockQuery !== "ALL"/);
  assert.match(teacherJs, /criterionQuery !== "ALL"/);
  assert.match(teacherJs, /renderAssignmentEvaluationFilterOptions/);
});


test('assignment cards edit on double click and do not carry grading action buttons', () => {
  assert.match(teacherJs, /teacherAssignmentList\.addEventListener\("dblclick"/);
  assert.match(teacherJs, /openAssignmentsModule\(\{[\s\S]*mode:\s*"edit"[\s\S]*assignmentId/);
  assert.doesNotMatch(teacherJs, /data-grade-assignment=/);
  assert.doesNotMatch(teacherJs, /data-manual-grade-assignment=/);
  assert.match(teacherHtml, /id="detailAiGradingBtn"/);
  assert.match(teacherHtml, /id="detailManualGradingBtn"/);
});

test('assignment edit mode reuses Create Assignment and updates the existing record', () => {
  assert.match(createModuleJs, /context\.mode === "edit"/);
  assert.match(createModuleJs, /editingAssignmentId/);
  assert.match(createModuleJs, /update\(ref\(db, `assignments\/\$\{editingAssignmentId\}`/);
  assert.match(createModuleJs, /youteach:assignment-updated/);
  assert.match(createModuleJs, /assignmentCode\.readOnly = true/);
});

test('assignment evaluation destination is labeled Category, not Criterion', () => {
  assert.match(createModuleHtml, />Category<\/label>/);
  assert.doesNotMatch(createModuleHtml, />Evaluation criterion<\/label>/);
  assert.match(teacherHtml, /class="assignment-filter-field category"/);
  assert.match(teacherJs, /"Unassigned category"/);
  assert.doesNotMatch(teacherJs, /"Needs criterion"/);
});

test('manual Check AI Results is removed and retry is only exposed for sync problems', () => {
  assert.doesNotMatch(teacherHtml, />Check AI Results<\/button>/);
  assert.match(teacherHtml, /id="retryAiSyncBtn"[^>]*hidden/);
  assert.match(teacherJs, /retryAiSyncBtn\.hidden = false/);
});


test('Assignment Browser keeps legacy, ALL, alias-linked, and submission-linked assignments visible in the active group', () => {
  assert.match(teacherJs, /function assignmentMatchesWorkingGroup\(assignment, assignmentId/);
  assert.match(teacherJs, /assignmentMatchesGroupEvidence/);
  assert.match(teacherJs, /groups: groupsCache/);
  assert.match(teacherJs, /submissions: submissionsCache\?\.\[assignmentId\]/);
  assert.match(teacherJs, /normalizeGroupName/);
});

test('Assignment Browser empty state distinguishes no group assignments from deleted data', () => {
  assert.match(teacherJs, /assignmentsCache/);
  assert.match(teacherJs, /assignmentBrowserCount/);
  assert.match(teacherJs, /existing assignment/);
});


test('Assignment Browser uses submission history to recover hidden or orphaned assignments', () => {
  assert.match(teacherJs, /assignmentMatchesGroupEvidence/);
  assert.match(teacherJs, /buildRecoveredAssignmentFromSubmissions/);
  assert.match(teacherJs, /assignmentMatchesWorkingGroup\(assignment, assignmentId/);
  assert.match(teacherJs, /submissionsCache\?\.\[assignmentId\]/);
  assert.match(teacherJs, /recoverOrphanAssignmentsFromSubmissions/);
  assert.match(teacherJs, /recoveredFromSubmissionHistory/);
  assert.match(teacherJs, /scheduleAssignmentRecovery/);
});

test('Assignment Browser reports historical submission group when stored group metadata is stale', () => {
  assert.match(teacherJs, /assignmentHistoricalGroupLabel/);
  assert.match(teacherJs, /Submission history:/);
});
