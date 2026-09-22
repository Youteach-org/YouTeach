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
const runtimeJs = readFileSync(join(root, 'group-grade-runtime.js'), 'utf8');

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
  assert.match(createJs, /mode: exam \? "exam" : "assignment"/);
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
