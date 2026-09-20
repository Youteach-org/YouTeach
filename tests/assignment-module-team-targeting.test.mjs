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

test('Assignment creation is type-first and does not offer Start from scratch', () => {
  const typeIndex = assignmentsHtml.indexOf('id="assignmentType"');
  const templateIndex = assignmentsHtml.indexOf('id="assignmentTemplateSource"');
  assert.ok(typeIndex >= 0 && templateIndex > typeIndex);
  assert.doesNotMatch(assignmentsHtml, /Start from scratch/);
  assert.match(assignmentsHtml, /id="assignmentOtherTypeField" hidden/);
  assert.match(assignmentsJs, /assignmentOtherTypeField\.hidden = assignmentType\.value !== "OTHER"/);
  assert.match(assignmentsJs, /No saved templates for this type/);
});


test('Create Assignment keeps the canonical visible fields and hides template workflow', () => {
  assert.match(assignmentsHtml, /id="assignmentType"/);
  assert.match(assignmentsHtml, /Assignment name/);
  assert.match(assignmentsHtml, /id="assignmentGroupHelp"/);
  assert.match(assignmentsHtml, /Due date and time/);
  assert.match(assignmentsHtml, /Instructions for students/);
  assert.match(assignmentsHtml, /id="createCriteriaHeading">Evaluation criteria/);
  assert.match(assignmentsHtml, /Instructions for ChatGPT when reviewing/);
  assert.doesNotMatch(assignmentsHtml, /Saved template \(optional\)/);
  assert.doesNotMatch(assignmentsHtml, /Template action/);
  assert.doesNotMatch(assignmentsHtml, /<details class="rubric-details">/);
  assert.match(assignmentsJs, /function applyAssignmentGroupContext\(\)/);
  assert.match(assignmentsJs, /Working group:/);
});

test('Generated-team target appears only in team module context', () => {
  assert.match(assignmentsHtml, /id="assignmentTargetField"[^>]*hidden/);
  assert.match(assignmentsJs, /All Generated Teams/);
  assert.match(assignmentsJs, /hasGeneratedTeamContext/);
  assert.match(assignmentsJs, /recipientStudentKeys/);
  assert.match(assignmentsJs, /recipientTeamTarget/);
});

test('Exact team recipients are enforced client-side and server-side', () => {
  assert.match(studentJs, /recipientStudentKeys/);
  assert.match(studentJs, /recipientKeys\.includes\(String\(studentKey\)\)/);
  assert.match(driveApi, /recipientStudentKeys/);
  assert.match(driveApi, /This assignment is not assigned to this student/);
});
