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

test('students and requests render as one compact row with the requested columns', () => {
  assert.match(html, /\.student-grid\{display:grid/);
  assert.match(html, /id="managedStudentsList"/);
  assert.match(html, /id="selectAllStudents"/);
  assert.match(html, /Full Name<\/span><span>Nickname<\/span><span>External ID<\/span><span>Group<\/span>/);
  assert.match(js, /student-row pending student-grid/);
  assert.match(js, /student-row enrolled student-grid/);
  assert.match(js, /escapeHtml\(groupName\)/);
  assert.doesNotMatch(js, /student-card-main/);
  assert.doesNotMatch(js, /inline-external-id/);
  assert.doesNotMatch(html, /<span>Status<\/span>/);
  assert.doesNotMatch(html, /student-toolbar-right/);
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

test('configured groups are harvested into independent rubric templates', () => {
  assert.match(js, /harvestConfiguredGroupsToTemplates/);
  assert.match(js, /ensureIndependentTemplate/);
  assert.match(js, /templateSignature/);
  assert.match(js, /automaticTemplateName/);
  assert.match(js, /groupEvaluationTemplates/);
  assert.doesNotMatch(js, /value="group:/);
  assert.doesNotMatch(js, /From group:/);
  assert.match(js, /patch\.sourceGroup = null|patch\.sourceGroup/);
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


test('Group Management selection state survives same-tab page navigation', () => {
  assert.match(js, /MANAGEMENT_STATE_KEY/);
  assert.match(js, /readManagementState/);
  assert.match(js, /persistManagementState/);
  assert.match(js, /sessionStorage\.setItem\(MANAGEMENT_STATE_KEY/);
  assert.match(js, /selectedRosterItems: \[\.\.\.selectedRosterItems\]/);
  assert.match(js, /loadGroupEditor\(selectedManagedGroup, \{ preserveView: true \}\)/);
});

test('Select all is in the roster header directly over row checkboxes', () => {
  const headerIndex = html.indexOf('student-list-head student-grid');
  const selectAllIndex = html.indexOf('id="selectAllStudents"');
  const listIndex = html.indexOf('id="managedStudentsList"');
  assert.ok(headerIndex >= 0 && selectAllIndex > headerIndex && listIndex > selectAllIndex);
});


test('requested E6C Fall 2026 criteria reset is one-time and preserves the group', () => {
  assert.match(js, /REQUESTED_CRITERIA_RESET_GROUP = "e6c fall 2026"/);
  assert.match(js, /REQUESTED_CRITERIA_RESET_MARKER = "criteriaReset20260921"/);
  assert.match(js, /clearRequestedGroupEvaluationOnce/);
  assert.match(js, /evaluationCriteria: null/);
  assert.match(js, /evaluationConfiguredAt: null/);
  assert.match(js, /maintenance\/\$\{REQUESTED_CRITERIA_RESET_MARKER\}/);
  assert.doesNotMatch(js, /groups\/\$\{groupName\}.*null/);
});
