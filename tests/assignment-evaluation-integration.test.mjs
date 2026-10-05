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

test('Create Assignment requires an evaluation category for every graded activity including exams', () => {
  assert.match(createHtml, /Evaluation category/);
  assert.match(createHtml, /This is the group criterion that receives the grade/);
  assert.match(createJs, /if \(!groupCriterion\)/);
  assert.doesNotMatch(createJs, /typeCode !== "EX" && !groupCriterion/);
  assert.match(createJs, /groupEvaluationCriterionId: groupCriterion\?\.id \|\| ""/);
  assert.match(targetJs, /criterionId: String\(criterion\?\.id \|\| ""\)/);
  assert.match(targetJs, /mode: exam \? "exam" : "assignment"/);
});

test('Create Assignment separates category, activity type, grading scheme, and grading workflow', () => {
  for (const id of [
    'assignmentGroupCriterion',
    'assignmentActivityType',
    'assignmentGradingScheme',
    'assignmentGradingWorkflow'
  ]) {
    assert.match(createHtml, new RegExp(`id="${id}"`));
  }
  assert.match(createJs, /activityTypesForSystemCategory/);
  assert.match(createJs, /selectedActivityMetadata/);
  assert.match(createJs, /systemCategory: activity\.systemCategory/);
  assert.match(createJs, /activitySubtype: activity\.activitySubtype/);
  assert.match(createJs, /gradingScheme: activity\.gradingScheme/);
  assert.match(createJs, /gradingWorkflow: activity\.gradingWorkflow/);
  assert.match(createJs, /assignmentTypeCode: typeCode/);
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

test('Assignment Browser defaults to the working group active block while keeping All blocks available', () => {
  assert.match(teacherHtml, /<option value="ALL">All blocks<\/option>/);
  assert.match(teacherJs, /activeEvaluationBlockForGroup/);
  assert.match(teacherJs, /evaluationBlockNames\(workingGroupConfig\)/);
  assert.match(teacherJs, /assignmentBlockFilterTouched/);
  assert.match(teacherJs, /assignmentBlockFilterGroup/);
  assert.match(
    teacherJs,
    /assignmentFilterBlock\.value = availableBlocks\.includes\(activeBlock\) \? activeBlock : "ALL"/
  );
});

test('manual All blocks or another block remains a browser filter and does not persist an active block', () => {
  const listenerStart = teacherJs.indexOf('assignmentFilterBlock?.addEventListener("change"');
  const listenerEnd = teacherJs.indexOf('assignmentFilterCriterion?.addEventListener', listenerStart);
  const listener = teacherJs.slice(listenerStart, listenerEnd);
  assert.match(listener, /assignmentBlockFilterTouched = true/);
  assert.doesNotMatch(listener, /activeEvaluationBlock|settings\/activeBlock|update\(ref\(db/);
});

test('clearing Assignment Browser filters returns to the group active block', () => {
  const clearStart = teacherJs.indexOf('clearAssignmentFiltersBtn.addEventListener');
  const clearEnd = teacherJs.indexOf('assignmentScrollLeftBtn.addEventListener', clearStart);
  const clearBlock = teacherJs.slice(clearStart, clearEnd);
  assert.match(clearBlock, /assignmentBlockFilterTouched = false/);
  assert.match(clearBlock, /renderAssignmentEvaluationFilterOptions\(\)/);
  assert.doesNotMatch(clearBlock, /assignmentFilterBlock\.value = "ALL"/);
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

test('assignment evaluation destination is the primary Evaluation category', () => {
  assert.match(createModuleHtml, />Evaluation category<\/label>/);
  assert.doesNotMatch(createModuleHtml, />Evaluation criterion<\/label>/);
  assert.match(teacherHtml, /class="assignment-filter-field category"/);
  assert.match(teacherJs, /"Needs category review"/);
  assert.doesNotMatch(teacherJs, /"Needs criterion"/);
});

test('Assignment Browser groups cards under evaluation categories and labels the activity subtype', () => {
  assert.match(teacherHtml, /assignment-category-group/);
  assert.match(teacherHtml, /assignment-category-items/);
  assert.match(teacherJs, /function assignmentCardHtml/);
  assert.match(teacherJs, /activityMetadataForAssignment/);
  assert.match(teacherJs, /assignment-activity-type/);
  assert.match(teacherJs, /Needs category review/);
  assert.match(teacherJs, /groupEvaluationConfig\(groupsCache\?\.\[workingGroup\]/);
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

test('Assignment Browser empty state surfaces stored assignments outside the active group instead of implying deletion', () => {
  assert.match(teacherJs, /assignmentsCache/);
  assert.match(teacherJs, /assignmentBrowserCount/);
  assert.match(teacherJs, /Stored assignments outside/);
  assert.match(teacherJs, /data-relink-assignment/);
  assert.match(teacherJs, /relinkHistoricalAssignmentToWorkingGroup/);
  assert.match(teacherJs, /groupRelinkedFrom/);
  assert.match(teacherJs, /evaluationTargetNeedsReview: true/);
});

test('historical Assignment relink persists groupName before optional audit metadata and verifies Firebase', () => {
  const start = teacherJs.indexOf('async function relinkHistoricalAssignmentToWorkingGroup');
  const end = teacherJs.indexOf('function assignmentCardHtml', start);
  assert.ok(start >= 0 && end > start);
  const block = teacherJs.slice(start, end);

  const criticalWrite = block.indexOf('groupName: workingGroup');
  const verificationRead = block.indexOf('assignments/${id}/groupName');
  const auditWrite = block.indexOf('groupRelinkedFrom: previousGroup');

  assert.ok(criticalWrite >= 0);
  assert.ok(verificationRead > criticalWrite);
  assert.ok(auditWrite > verificationRead);
  assert.match(block, /persistedGroup !== workingGroup/);
  assert.match(block, /assignmentsCache\[id\] =/);
  assert.match(block, /scheduleAssignmentEvaluationMigration\(\)/);
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


test('Assignment Browser defines isExamAssignment exactly once at module scope', () => {
  const imported = /import\s*\{[^}]*isExamAssignment[^}]*\}\s*from\s*["']\.\/assignment-evaluation-target\.js["']/s.test(teacherJs);
  const local = /function\s+isExamAssignment\s*\(/.test(teacherJs);
  assert.equal(Number(imported) + Number(local), 1);
});


test('Assignments hidden working-group field is never treated as a select', () => {
  assert.match(teacherHtml, /<input id="assignmentGroup" type="hidden">/);
  assert.doesNotMatch(teacherJs, /assignmentGroup\.options/);
  assert.doesNotMatch(teacherJs, /assignmentGroup\.appendChild\(/);
});


test('assignment card defers single-click selection so double-click edit can win', () => {
  const clickStart = teacherJs.indexOf('teacherAssignmentList.addEventListener("click"');
  const doubleStart = teacherJs.indexOf('teacherAssignmentList.addEventListener("dblclick"');
  assert.ok(clickStart >= 0);
  assert.ok(doubleStart > clickStart);

  const clickBlock = teacherJs.slice(clickStart, doubleStart);
  const doubleBlock = teacherJs.slice(doubleStart, doubleStart + 900);

  assert.match(clickBlock, /setTimeout\(/);
  assert.match(clickBlock, /event\.detail\s*>\s*1/);
  assert.match(clickBlock, /clearTimeout\(/);
  assert.match(doubleBlock, /clearTimeout\(/);
  assert.match(doubleBlock, /openAssignmentEditorFromCard\(card\)/);
  assert.match(teacherJs, /function openAssignmentEditorFromCard\(card\)[\s\S]*openAssignmentsModule\([\s\S]*mode:\s*"edit"/);
});

test('assignment overview stacks Assignment first and Criteria second at full width with readable text', () => {
  const assignmentIndex = teacherHtml.indexOf('class="assignment-overview-card"');
  const criteriaIndex = teacherHtml.indexOf('class="criteria-summary-card"');
  assert.ok(assignmentIndex >= 0);
  assert.ok(criteriaIndex > assignmentIndex);
  assert.match(teacherHtml, /\.assignment-overview-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(teacherHtml, /\.overview-main h3\s*\{[^}]*font-size:\s*(?:1[6789]|2\d)px/s);
  assert.match(teacherHtml, /\.criteria-summary-title\s*\{[^}]*font-size:\s*(?:1[234]|1[5-9]|2\d)px/s);
  assert.match(teacherHtml, /\.criteria-summary-card \.criteria-compact-item\s*\{[^}]*font-size:\s*(?:10|11|12|13|14)px/s);
});


test('assignment card second click opens Edit Assignment without relying only on native dblclick', () => {
  const clickStart = teacherJs.indexOf('teacherAssignmentList.addEventListener("click"');
  const doubleStart = teacherJs.indexOf('teacherAssignmentList.addEventListener("dblclick"');
  const clickBlock = teacherJs.slice(clickStart, doubleStart);

  assert.match(clickBlock, /event\.detail\s*>\s*1/);
  assert.match(clickBlock, /openAssignmentEditorFromCard\(card\)/);
  assert.match(teacherJs, /function openAssignmentEditorFromCard\(card\)/);
});


test('Assignment Browser count distinguishes current-group assignments from repository total', () => {
  assert.match(teacherJs, /const groupEntries = allEntries\.filter/);
  assert.match(teacherJs, /\$\{groupEntries\.length\} in group/);
  assert.match(teacherJs, /\$\{allEntries\.length\} total/);
  assert.doesNotMatch(
    teacherJs,
    /\$\{entries\.length\} shown · \$\{allEntries\.length\} existing/
  );
});

test('Needs category review is not hidden by the untouched default active-block filter', () => {
  assert.match(teacherJs, /const needsCategoryReview = criterionKey === "__UNASSIGNED__"/);
  assert.match(
    teacherJs,
    /blockQuery !== "ALL"[\s\S]*target\.block !== blockQuery[\s\S]*!\(needsCategoryReview && !assignmentBlockFilterTouched\)/
  );
});
