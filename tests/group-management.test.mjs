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

test('Group Management keeps its header and moves group editing into dialogs', () => {
  assert.match(html, /<title>YouTeach - Group Management<\/title>/);
  assert.match(html, /<h2>Group Management<\/h2>/);
  assert.match(html, /<dialog id="groupEditorDialog">/);
  assert.match(html, /id="openCreateGroupDialogBtn"/);
  assert.match(html, /id="openGroupEvaluationDialogBtn"/);
  assert.match(html, /id="enrolledStudentsSection"/);
  assert.doesNotMatch(html, /id="groupEditorCard"/);
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

test('Group Management uses the same student progress matrix as Teacher Students', () => {
  assert.doesNotMatch(html, /id="managedStudentsList"/);
  assert.doesNotMatch(html, /student-list-head student-grid/);
  assert.match(html, /id="managedStudentsTableHeadRow"/);
  assert.match(html, /id="managedStudentsTableBody"/);
  assert.match(html, /managed-student-column-header/);
  assert.match(html, /managed-students-table-wrap/);
  assert.match(html, /managed-block-criteria-grid/);
  assert.match(html, /managed-block-values-grid/);
  assert.match(html, /managed-block-total/);
  assert.match(html, /id="managedStudentSearchToggle"/);
  assert.match(html, /id="managedStudentSearchPanel"[^>]*hidden/);
  assert.match(html, /id="openManagedBlockReportBtn"/);
  assert.match(js, /calculateStudentBlockGrade/);
  assert.match(js, /managedStudentNameFontSize/);
  assert.match(js, /managedCriterionHeaderLabel/);
  assert.match(js, /managedBlockGradeHtml/);
  assert.match(js, /managedStudentSearch\.addEventListener\("input", renderManagedStudents\)/);
  assert.match(js, /managedStudentsTableBody\.addEventListener\("dblclick"/);
  assert.match(js, /teacherViewStudentKey/);
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

test('pending enrollment requests keep select-all and approval actions outside the student matrix', () => {
  assert.match(html, /id="pendingRequestsPanel"[^>]*hidden/);
  assert.match(html, /id="pendingRequestsList"/);
  assert.match(html, /id="selectAllStudents"/);
  assert.match(js, /pendingRequestsList\.addEventListener\("click"/);
  assert.match(js, /selectAllStudents\.addEventListener\("change"/);
  assert.match(js, /approveSelectedRequests/);
  assert.match(js, /denySelectedRequests/);
});

test('requested E6C Fall 2026 criteria reset is one-time and preserves the group', () => {
  assert.match(js, /REQUESTED_CRITERIA_RESET_GROUP = "e6c fall 2026"/);
  assert.match(js, /REQUESTED_CRITERIA_RESET_MARKER = "criteriaReset20260921"/);
  const start = js.indexOf('async function clearRequestedGroupEvaluationOnce');
  const end = js.indexOf('onValue(ref(db, "groups")', start);
  const block = js.slice(start, end);
  assert.match(block, /evaluationCriteria: null/);
  assert.match(block, /evaluationConfiguredAt: null/);
  assert.match(block, /maintenance\/\$\{REQUESTED_CRITERIA_RESET_MARKER\}/);
  assert.doesNotMatch(block, /set\(ref\(db, `groups\/\$\{groupName\}`\), null\)/);
  assert.doesNotMatch(block, /\[`groups\/\$\{groupName\}`\]\s*=\s*null/);
});


test('existing group evaluation settings autosave with no Save Group Settings flow', () => {
  assert.match(js, /async function saveExistingGroupEvaluation/);
  assert.match(js, /function scheduleExistingGroupEvaluationSave/);
  assert.match(js, /evaluationCriteriaRows\.addEventListener\("input"/);
  assert.match(js, /evaluationCriteriaRows\.addEventListener\("change"/);
  assert.match(js, /evaluationUnitCountInput\.addEventListener\("input"/);
  assert.match(js, /scheduleExistingGroupEvaluationSave\(\{ immediate: true \}\)/);
  assert.match(js, /createGroupBtn\.hidden = true/);
  assert.doesNotMatch(js, /Save Group Settings/);
  assert.doesNotMatch(js, /Use Set Evaluation/);
});

test('deleting criteria saves the group draft while preserving previously created templates', () => {
  const autosaveStart = js.indexOf('async function saveExistingGroupEvaluation');
  const autosaveEnd = js.indexOf('function scheduleExistingGroupEvaluationSave', autosaveStart);
  const autosave = js.slice(autosaveStart, autosaveEnd);
  assert.match(autosave, /evaluationCriteria: evaluationCriteria\.length \? criteriaToFirebaseObject\(evaluationCriteria\) : null/);
  assert.match(autosave, /if \(valid\) \{/);
  assert.match(autosave, /ensureIndependentTemplate/);
  assert.doesNotMatch(autosave, /groupEvaluationTemplates\/.*null/);
});


test('Use Template refreshes missing templates from valid configured groups before opening', () => {
  assert.match(js, /async function openEvaluationTemplateDialog/);
  assert.match(js, /harvestConfiguredGroupsToTemplates\(\{ force: true \}\)/);
  assert.match(js, /groupEvaluationConfig\(group\)/);
  assert.match(js, /if \(!config\.configured\) continue/);
  assert.match(js, /ensureIndependentTemplate/);
  assert.match(js, /evaluationTemplateDialog\.showModal\(\)/);
});

test('template library uses the established writable settings branch with legacy migration fallback', () => {
  assert.match(js, /TEMPLATE_LIBRARY_PATH = "settings\/groupEvaluationTemplates"/);
  assert.match(js, /onValue\(ref\(db, TEMPLATE_LIBRARY_PATH\)/);
  assert.match(js, /legacyEvaluationTemplatesCache/);
  assert.match(js, /onValue\(ref\(db, "groupEvaluationTemplates"\)/);
  assert.match(js, /mergedTemplateCache/);
});


test('evaluation unit count cannot shrink below the highest block with recorded grades', () => {
  assert.match(js, /function minimumEvaluationUnitCountForGroup/);
  assert.match(js, /function applyEvaluationUnitFloor/);
  assert.match(js, /student\?\.examPoints/);
  assert.match(js, /student\?\.evaluationCriterionScores/);
  assert.match(js, /student\?\.taskPoints/);
  assert.match(js, /student\?\.attendancePoints/);
  assert.match(js, /pointsLogCache/);
  assert.match(js, /assignmentSubmissionsCache/);
  assert.match(js, /grading\?\.totalScore/);
  assert.match(js, /Cannot reduce to \$\{requested\} block\(s\)/);
  assert.match(js, /evaluationUnitCountInput\.min = String\(minimum\)/);
});

test('initialized zero activity points alone do not lock unused future blocks', () => {
  const start = js.indexOf('function minimumEvaluationUnitCountForGroup');
  const end = js.indexOf('function applyEvaluationUnitFloor', start);
  const block = js.slice(start, end);
  assert.match(block, /Number\(value\) !== 0/);
  assert.match(block, /blockPoints is initialized to zero/);
});


test('block reduction refreshes live grade evidence before saving a lower count', () => {
  assert.match(js, /async function refreshGradeEvidenceCaches/);
  assert.match(js, /get\(ref\(db, "students"\)\)/);
  assert.match(js, /get\(ref\(db, "assignments"\)\)/);
  assert.match(js, /get\(ref\(db, "assignmentSubmissions"\)\)/);
  assert.match(js, /get\(ref\(db, "pointsLog"\)\)/);
  assert.match(js, /if \(evaluationUnitCount < storedUnitCount\)/);
  assert.match(js, /await refreshGradeEvidenceCaches\(\)/);
  assert.match(js, /Could not verify existing grades\. Block count was not reduced\./);
});


test('Blocks and criteria open in the group editor popup instead of an inline expandable section', () => {
  assert.match(html, /<dialog id="groupEditorDialog">/);
  assert.match(html, /id="openGroupEvaluationDialogBtn"[^>]*>Blocks &amp; Criteria<\/button>/);
  assert.match(js, /function openSelectedGroupEvaluationDialog/);
  assert.match(js, /groupEditorDialog\.showModal\(\)/);
  assert.match(js, /groupEditorTitle\.textContent = `Blocks & Criteria:/);
  assert.doesNotMatch(html, /id="toggleEvaluationBtn"/);
  assert.doesNotMatch(js, /EVALUATION_PANEL_STATE_KEY/);
});

test('Enrolled Students header keeps active enrollment link, Add Student, and collapse controls together', () => {
  assert.doesNotMatch(html, /id="managedGroupStatus"/);
  assert.doesNotMatch(html, /Managing <strong/);
  assert.doesNotMatch(html, /copyEnrollmentLinkBtn/);
  const start = html.indexOf('<section class="panel-card full-width-card" id="enrolledStudentsSection">');
  const end = html.indexOf('<div id="enrollmentControls"', start);
  const header = html.slice(start, end);
  assert.match(header, /id="createEnrollmentLinkBtn"[^>]*>Active enrollment link<\/button>/);
  assert.match(header, /id="openAddStudentModalBtn"[^>]*>Add Student<\/button>/);
  assert.match(header, /id="toggleRosterBtn"/);
  assert.ok(header.indexOf('createEnrollmentLinkBtn') < header.indexOf('openAddStudentModalBtn'));
  assert.ok(header.indexOf('openAddStudentModalBtn') < header.indexOf('toggleRosterBtn'));
  assert.match(js, /createEnrollmentLinkBtn\.textContent = "Active enrollment link"/);
  assert.match(js, /createEnrollmentLinkBtn\.setAttribute\("aria-pressed", String\(active\)\)/);
  assert.match(js, /enrollmentLinkExpanded = !enrollmentLinkExpanded/);
  assert.match(js, /await createOrRotateEnrollmentLink\(\)/);
  assert.doesNotMatch(js, /"Create enrollment link"/);
});

test('managed student identity mode is saved on the group and search remains field-independent', () => {
  assert.match(html, /id="managedStudentDisplayModeBtn"/);
  assert.match(js, /MANAGED_DISPLAY_MODES = \["name", "lastNames", "nickname"\]/);
  assert.match(js, /studentListDisplayMode/);
  assert.match(js, /groups\/\$\{groupName\}/);
  assert.match(js, /studentListDisplayUpdatedAt/);
  assert.match(js, /parts\.fullName/);
  assert.match(js, /parts\.givenNames/);
  assert.match(js, /parts\.lastNames/);
  assert.match(js, /student\?\.nickname/);
  assert.match(js, /student\?\.studentNumber/);
  assert.match(js, /student\?\.id/);
  assert.match(js, /function managedOrderedFullName/);
  assert.match(js, /managedOrderedFullName\(student, \{ lastNamesFirst: true \}\)/);
  assert.doesNotMatch(js, /mode === "lastNames"\) return parts\.lastNames/);
});

test('managed student secondary metadata is one line under the primary identity', () => {
  assert.match(html, /\.managed-student-meta\{display:flex;align-items:center/);
  assert.match(html, /white-space:nowrap/);
  assert.match(js, /pieces\.join\(" · "\)/);
  assert.match(js, /<span class="managed-student-meta">\$\{escapeHtml\(secondary\)\}<\/span>/);
});

test('Create Group is a popup with an explicit Cancel action and Add Student tabs expose selection state', () => {
  assert.match(html, /id="openCreateGroupDialogBtn"[^>]*>\+ Create Group<\/button>/);
  assert.match(html, /<dialog id="groupEditorDialog">/);
  assert.match(html, /id="cancelGroupEditBtn"[^>]*>Cancel<\/button>/);
  assert.match(js, /function prepareCreateGroupDialog/);
  assert.match(js, /openCreateGroupDialogBtn\.addEventListener\("click", prepareCreateGroupDialog\)/);
  assert.match(js, /cancelGroupEditBtn\.addEventListener\("click", \(\) => groupEditorDialog\.close\(\)\)/);
  assert.match(html, /class="modal-tab active" aria-selected="true">Manual<\/button>/);
  assert.match(html, /\.modal-tabs \.modal-tab\.active::before\{content:"✓ "/);
  assert.match(js, /button\.setAttribute\("aria-selected", String\(isActive\)\)/);
});

