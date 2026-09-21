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

test('Group Management keeps one full-width editor and no standalone delete/add cards', () => {
  assert.match(html, /<title>YouTeach - Group Management<\/title>/);
  assert.match(html, /<h2>Group Management<\/h2>/);
  assert.match(html, /id="groupEditorCard"/);
  assert.match(html, /id="enrolledStudentsSection"/);
  assert.doesNotMatch(html, /<h3>Delete Group<\/h3>/);
  assert.doesNotMatch(html, /<h3>Add Student<\/h3>/);
});

test('group rows only select a group; Delete appears once in contextual group actions', () => {
  assert.match(js, /data-manage-group/);
  assert.match(html, /id="selectedGroupActions"/);
  assert.match(html, /id="deleteSelectedGroupBtn"/);
  assert.match(js, /selectManagedGroup\(/);
  assert.match(js, /deleteGroupWithBackup\(/);
  assert.doesNotMatch(js, /data-delete-group/);
  assert.doesNotMatch(html, /data-delete-group/);
  assert.doesNotMatch(html, /id="deleteGroupSelect"/);
  assert.doesNotMatch(js, /data-edit-group-evaluation/);
});

test('selecting the same group or the chevron collapses and expands its roster', () => {
  assert.match(html, /id="toggleRosterBtn"/);
  assert.match(html, /id="rosterBody"/);
  assert.match(js, /selectedManagedGroup === groupName/);
  assert.match(js, /rosterCollapsed = !rosterCollapsed/);
  assert.match(js, /toggleRosterBtn\.setAttribute\("aria-expanded"/);
  assert.match(js, /group-chevron/);
});

test('students and requests render as compact single-line grid rows', () => {
  assert.match(html, /\.student-grid\{display:grid/);
  assert.match(html, /id="managedStudentsList"/);
  assert.match(js, /student-row pending student-grid/);
  assert.match(js, /student-row enrolled student-grid/);
  assert.doesNotMatch(js, /student-card-main/);
  assert.doesNotMatch(js, /inline-external-id/);
});

test('student actions stay hidden until a row is selected', () => {
  assert.match(html, /id="selectedRosterActions"[^>]*hidden/);
  assert.match(html, /id="openSelectedStudentBtn"[^>]*hidden/);
  assert.match(html, /id="approveEnrollmentBtn"[^>]*hidden/);
  assert.match(html, /id="denyEnrollmentBtn"[^>]*hidden/);
  assert.match(html, /id="expelStudentBtn"[^>]*hidden/);
  assert.match(js, /renderRosterContextActions/);
  assert.match(js, /selectedRosterActions\.hidden = total === 0/);
  assert.match(js, /teacherViewStudentKey/);
});

test('Use Template is a popup and there is no permanent template selector', () => {
  assert.match(html, /id="useEvaluationTemplateBtn"/);
  assert.match(html, /<dialog id="evaluationTemplateDialog">/);
  assert.match(html, /id="evaluationTemplateList"/);
  assert.match(html, /id="useSelectedEvaluationTemplateBtn"/);
  assert.doesNotMatch(html, /id="evaluationTemplateSelect"/);
  assert.match(js, /openEvaluationTemplateDialog/);
  assert.match(js, /renderEvaluationTemplateList/);
});

test('configured groups are harvested into independent reusable templates', () => {
  assert.match(js, /harvestConfiguredGroupsToTemplates/);
  assert.match(js, /ensureIndependentTemplate/);
  assert.match(js, /templateSignature/);
  assert.match(js, /automaticTemplateName/);
  assert.match(js, /groupEvaluationTemplates/);
  assert.doesNotMatch(js, /value="group:/);
  assert.doesNotMatch(js, /sourceGroup/);
});

test('manual add and bulk import remain inside the Add Student popup', () => {
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
