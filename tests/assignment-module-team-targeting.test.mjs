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
  assert.match(createModuleJs, /assignmentType\.value === "OTHER"/);
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
  assert.match(createModuleHtml, /<h1>Create Assignment<\/h1>/);
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
  assert.match(createModuleJs, /assignmentType\.value === "OTHER"/);
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
