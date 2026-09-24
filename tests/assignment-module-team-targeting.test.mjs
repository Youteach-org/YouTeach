import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

const buzzerHtml = read('buzzer.html');
const buzzerJs = read('buzzer.js');
const assignmentsHtml = read('teacher-assignments.html');
const assignmentsJs = read('teacher-assignments.js');
const createModuleHtml = read('assignment-create-module.html');
const createModuleJs = read('assignment-create-module.js');
const moduleLauncherJs = read('assignment-module-launcher.js');
const studentJs = read('student-assignments.js');
const driveApi = read('functions/api/drive-upload-session.js');

test('Buzzer generates teams before exposing Assignments module', () => {
  assert.match(buzzerHtml, /id="createTeams"/);
  assert.match(buzzerHtml, /id="openAssignmentsModuleBtn"[^>]*disabled/);
  assert.doesNotMatch(buzzerHtml, /id="activityTypeSelect"/);
  assert.doesNotMatch(buzzerHtml, /id="activityOtherType"/);
  assert.doesNotMatch(buzzerHtml, /id="activityTeamTarget"/);
  assert.doesNotMatch(buzzerHtml, /id="scheduleTeamActivityBtn"/);
  assert.match(buzzerJs, /buildAssignmentsModuleContext/);
  assert.match(buzzerJs, /openAssignmentsModule\(context\)/);
});

test('Create Assignment popup offers explicit scratch/library source toggle and conditional Other', () => {
  assert.match(createModuleHtml, /id="createFromScratchBtn"/);
  assert.match(createModuleHtml, /id="createFromLibraryBtn"/);
  assert.match(createModuleHtml, /id="assignmentType"/);
  assert.match(createModuleHtml, /id="assignmentOtherTypeField" hidden/);
  assert.match(createModuleJs, /function renderOtherTypeField\(\)/);
  assert.match(createModuleJs, /assignmentActivityType\?\.value \|\| ""/);
  assert.match(createModuleJs, /=== "CUSTOM"/);
});

test('Create Assignment popup keeps the canonical assignment fields while Library is only a source chooser', () => {
  assert.match(createModuleHtml, /Assignment name/);
  assert.match(createModuleHtml, /id="assignmentGroupHelp"/);
  assert.match(createModuleHtml, /Due date and time/);
  assert.match(createModuleHtml, /Instructions for students/);
  assert.match(createModuleHtml, /id="criteriaHeading">Evaluation criteria/);
  assert.match(createModuleHtml, /Instructions for ChatGPT when reviewing/);
  assert.match(createModuleHtml, /id="assignmentLibraryPanel"/);
  assert.doesNotMatch(createModuleHtml, /Assignment Browser/);
  assert.doesNotMatch(createModuleHtml, /submissionList/);
});

test('Generated-team target is handled by the shared Create Assignment module', () => {
  assert.match(createModuleHtml, /id="assignmentTargetField"[^>]*hidden/);
  assert.match(createModuleJs, /All Generated Teams/);
  assert.match(createModuleJs, /hasGeneratedTeamContext/);
  assert.match(createModuleJs, /recipientStudentKeys/);
  assert.match(createModuleJs, /recipientTeamTarget/);
});

test('Exact team recipients are enforced client-side and server-side', () => {
  assert.match(studentJs, /recipientStudentKeys/);
  assert.match(studentJs, /recipientKeys\.includes\(String\(studentKey\)\)/);
  assert.match(driveApi, /recipientStudentKeys/);
  assert.match(driveApi, /This assignment is not assigned to this student/);
});


test('Assignments popup loads only the dedicated Create Assignment module', () => {
  assert.match(moduleLauncherJs, /assignment-create-module\.html/);
  assert.doesNotMatch(moduleLauncherJs, /teacher-assignments\.html\?module=1/);
  assert.match(createModuleHtml, /<h1 id="assignmentModuleTitle">Create Assignment<\/h1>/);
  assert.match(createModuleHtml, /id="assignmentType"/);
  assert.match(createModuleHtml, /id="createPresetCriteria"/);
  assert.match(createModuleHtml, /Instructions for ChatGPT when reviewing/);
  assert.doesNotMatch(createModuleHtml, /Assignment Browser/);
  assert.match(createModuleHtml, /Assignment Library/);
  assert.match(createModuleHtml, /id="createFromScratchBtn"/);
  assert.match(createModuleHtml, /id="createFromLibraryBtn"/);
  assert.doesNotMatch(createModuleHtml, /submissionList/);
  assert.match(createModuleJs, /recipientStudentKeys/);
  assert.match(assignmentsJs, /openAssignmentsModule\(\{ source: "assignments" \}\)/);
});


test('Create Assignment popup keeps Other conditional and student instructions dominant', () => {
  assert.match(createModuleHtml, /id="assignmentOtherTypeField" hidden style="display:none"/);
  assert.match(createModuleJs, /function renderOtherTypeField\(\)/);
  assert.match(createModuleJs, /assignmentActivityType\?\.value \|\| ""/);
  assert.match(createModuleJs, /=== "CUSTOM"/);
  assert.match(createModuleHtml, /class="field student-instructions"/);
  assert.match(createModuleHtml, /min-height:170px/);
});

test('Assignments uses direct Create Assignment access without Actions menu', () => {
  assert.match(assignmentsHtml, /id="openAssignmentsModuleBtn"/);
  assert.doesNotMatch(assignmentsHtml, /id="assignmentActionsMenu"/);
  assert.doesNotMatch(assignmentsHtml, /id="showCreateAssignmentBtn"/);
});

test('Buzzer layout prioritizes control, team grid, and Team Source context', () => {
  assert.ok(buzzerHtml.indexOf('<h3>Buzzer Control<\/h3>') < buzzerHtml.indexOf('Teams and Members'));
  assert.match(buzzerHtml, /repeat\(auto-fit, minmax\(270px, 1fr\)\)/);
  assert.match(buzzerHtml, /#resetSession\s*\{/);
  assert.match(buzzerHtml, /<h4>Team Source<\/h4>/);
  assert.doesNotMatch(buzzerHtml, /id="groupSelect"/);
  assert.match(buzzerJs, /getStoredWorkingGroup\(\)/);
});


test('Assignment Library lives inside the popup and can reuse previous assignments', () => {
  assert.match(createModuleHtml, /id="assignmentLibraryPanel"/);
  assert.match(createModuleJs, /kind: "assignment"/);
  assert.match(createModuleJs, /sourceAssignmentId/);
  assert.match(createModuleJs, /kind: "template"/);
  assert.match(assignmentsHtml, /id="assignmentLibraryCompatibility" hidden/);
  assert.doesNotMatch(assignmentsHtml, /<section id="assignmentLibraryPanel"/);
});


test('Assignments keeps moved Library hooks from crashing normal page', () => {
  assert.match(assignmentsHtml, /id="saveSelectedTemplateBtn"/);
  assert.match(assignmentsHtml, /id="assignmentTemplateStatus"/);
  assert.match(assignmentsJs, /saveSelectedTemplateBtn\?\.addEventListener/);
  assert.match(assignmentsJs, /if \(saveSelectedTemplateBtn\) saveSelectedTemplateBtn\.disabled/);
});

test('Create Assignment source toggle has a visible active color state', () => {
  assert.match(createModuleHtml, /\.creation-source-toggle button\.active/);
  assert.match(createModuleHtml, /button\[aria-pressed="true"\]/);
  assert.match(createModuleHtml, /background:#2563eb/);
  assert.match(createModuleJs, /classList\.toggle\("active"/);
});


test('Create Assignment uses an internal assignment id and Task Code no longer depends on due date', () => {
  assert.match(createModuleJs, /let draftAssignmentId\s*=/);
  assert.match(createModuleJs, /push\(ref\(db, "assignments"\)\)\.key/);
  assert.match(createModuleJs, /internalId:\s*draftAssignmentId/);
  assert.match(createModuleJs, /function internalCodeSuffix\(/);
  const taskCodeStart = createModuleJs.indexOf('function taskCodeBase()');
  const taskCodeEnd = createModuleJs.indexOf('function taskCodeExists', taskCodeStart);
  const taskCodeBlock = createModuleJs.slice(taskCodeStart, taskCodeEnd);
  assert.doesNotMatch(taskCodeBlock, /dateCode|assignmentDueAt/);
  assert.match(taskCodeBlock, /internalCodeSuffix/);
});

test('Due date is optional and date-less assignments are saved as planning items', () => {
  assert.match(createModuleHtml, /Due date and time \(optional\)/);
  assert.doesNotMatch(createModuleHtml, /id="assignmentDueAt"[^>]*required/);
  assert.doesNotMatch(createModuleJs, /Select the due date and time/);
  assert.match(createModuleJs, /planning:\s*!dueAt/);
  assert.match(createModuleJs, /active:\s*Boolean\(dueAt\)/);
});

test('Create Assignment warns before closing dirty unsaved work', () => {
  assert.match(createModuleJs, /function markFormDirty\(/);
  assert.match(createModuleJs, /youteach:assignment-dirty/);
  assert.match(createModuleJs, /youteach:assignment-clean/);
  assert.match(moduleLauncherJs, /unsaved changes/i);
  assert.match(moduleLauncherJs, /window\.confirm\(/);
  assert.match(moduleLauncherJs, /assignmentDirty/);
});

test('Project checkpoints remain before full-width ChatGPT instructions', () => {
  const checkpointIndex = createModuleHtml.indexOf('id="projectCheckpointBuilder"');
  const chatgptIndex = createModuleHtml.indexOf('id="assignmentEvaluationNotes"');
  assert.ok(checkpointIndex >= 0);
  assert.ok(chatgptIndex > checkpointIndex);
  assert.match(createModuleHtml, /\.instructions-field\s*\{[^}]*grid-column:1\/-1/s);
});

test('selected Assignment Criteria card shows student instructions prominently and does not call them Notes', () => {
  assert.match(assignmentsJs, /criteria-assignment-instructions/);
  assert.match(assignmentsJs, /splitStoredInstructions\(assignment\.instructions\)\.visibleInstructions/);
  assert.match(assignmentsJs, /ChatGPT review instructions:/);
  const start = assignmentsJs.indexOf('function renderEvaluationCriteria');
  const end = assignmentsJs.indexOf('function assignmentStudents', start);
  const block = assignmentsJs.slice(start, end);
  assert.doesNotMatch(block, />Notes:/);
});


test('Project checkpoints card stays visible in Create Assignment and activates for PJ', () => {
  assert.match(createModuleHtml, /<section id="projectCheckpointBuilder" class="project-builder">/);
  assert.match(createModuleHtml, /id="projectCheckpointState"/);
  assert.match(createModuleJs, /projectCheckpointBuilder\.classList\.toggle\("inactive", !projectSelected\)/);
  assert.match(createModuleJs, /projectCheckpointState\.textContent/);
  assert.match(createModuleJs, /addProjectCheckpointBtn\.disabled = !projectSelected/);
});
