import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'teacher-enrollment.html'), 'utf8');
const js = readFileSync(join(root, 'teacher-enrollment.js'), 'utf8');
const enrollHtml = readFileSync(join(root, 'student-enroll.html'), 'utf8');
const enrollJs = readFileSync(join(root, 'student-enroll.js'), 'utf8');

test('Groups page is now Group Management with full-width management sections', () => {
  assert.match(html, /<title>YouTeach - Group Management<\/title>/);
  assert.match(html, /<h2>Group Management<\/h2>/);
  assert.match(html, /id="groupEditorCard"/);
  assert.match(html, /id="enrolledStudentsSection"/);
  assert.doesNotMatch(html, /<h3>Delete Group<\/h3>/);
  assert.doesNotMatch(html, /<h3>Add Student<\/h3>/);
});

test('group rows select management from the group name and deletion lives in the Groups list', () => {
  assert.match(js, /data-manage-group/);
  assert.match(js, /data-delete-group/);
  assert.match(js, /manageGroup\(/);
  assert.match(js, /deleteGroupWithBackup\(/);
  assert.doesNotMatch(html, /id="deleteGroupSelect"/);
  assert.doesNotMatch(js, /data-edit-group-evaluation/);
});

test('evaluation setup is a single editor and configured groups are usable as templates', () => {
  assert.match(html, /id="toggleEvaluationBtn"/);
  assert.match(js, /configuredGroupTemplateOptions/);
  assert.match(js, /value="group:/);
  assert.match(js, /selectedEvaluationTemplate/);
  assert.match(js, /source\.evaluationCriteria/);
  assert.match(js, /Edit Evaluation/);
  assert.match(js, /Set Evaluation/);
});

test('Enrolled Students uses selectable full-width cards and standard master checkbox', () => {
  assert.match(html, /id="selectAllStudents"/);
  assert.match(html, /id="managedStudentsList"/);
  assert.match(js, /student-card pending/);
  assert.match(js, /student-card enrolled/);
  assert.match(js, /selectedRosterItems/);
  assert.match(js, /teacherViewStudentKey/);
  assert.match(js, /inline-external-id/);
});

test('manual add and bulk import are moved into the Add Student popup', () => {
  assert.match(html, /<dialog id="addStudentDialog">/);
  assert.match(html, /id="studentName"/);
  assert.match(html, /id="studentNickname"/);
  assert.match(html, /id="studentNumberManual"/);
  assert.match(html, /id="csvStudentPane"/);
  assert.match(html, /id="pasteStudentPane"/);
});

test('enrollment links create pending requests and approval creates canonical students', () => {
  assert.match(html, /id="createEnrollmentLinkBtn"/);
  assert.match(js, /groupEnrollmentRequests/);
  assert.match(js, /status: "approved"/);
  assert.match(js, /approveSelectedRequests/);
  assert.match(js, /denySelectedRequests/);
  assert.match(js, /expelSelectedStudents/);
  assert.match(enrollHtml, /Request Group Enrollment/);
  assert.match(enrollJs, /status: "pending"/);
  assert.match(enrollJs, /groups\/\$\{groupName\}/);
  assert.match(enrollJs, /groupEnrollmentRequests\/\$\{groupName\}/);
});

test('group deletion requires exact name and downloads reconstructable backup before delete update', () => {
  assert.match(js, /Type the exact group name to confirm/);
  assert.match(js, /youteach-group-backup/);
  assert.match(js, /schemaVersion: 1/);
  assert.match(js, /triggerJsonDownload/);
  assert.match(js, /assignmentSubmissions/);
  assert.match(js, /attendance/);
  assert.match(js, /pointsLog/);
  assert.match(js, /sessionHistory/);

  const downloadIndex = js.indexOf('triggerJsonDownload(');
  const deleteUpdateIndex = js.indexOf('await update(ref(db), buildGroupDeletionUpdates');
  assert.ok(downloadIndex >= 0 && deleteUpdateIndex > downloadIndex);
});
