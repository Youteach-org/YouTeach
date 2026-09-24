import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'group-mangement.html'), 'utf8');
const js = readFileSync(join(root, 'group-mangement.js'), 'utf8');
const liveJs = readFileSync(join(root, 'teacher-enrollment.js'), 'utf8');
const enrollHtml = readFileSync(join(root, 'student-enroll.html'), 'utf8');
const enrollJs = readFileSync(join(root, 'student-enroll.js'), 'utf8');
const groupsDialogPath = join(root, 'groups-dialog.js');
const groupsDialogJs = existsSync(groupsDialogPath) ? readFileSync(groupsDialogPath, 'utf8') : '';

test('Group Management keeps its header and moves group editing into dialogs', () => {
  assert.match(html, /<title>YouTeach - Group Management<\/title>/);
  assert.match(html, /<h2>Group Management<\/h2>/);
  assert.match(html, /<dialog id="groupEditorDialog">/);
  assert.match(groupsDialogJs, /id="openCreateGroupDialogBtn"/);
  assert.match(groupsDialogJs, /id="openGroupEvaluationDialogBtn"/);
  assert.match(html, /id="enrolledStudentsSection"/);
  assert.doesNotMatch(html, /id="groupEditorCard"/);
  assert.match(html, /<dialog id="deleteGroupDialog">/);
  assert.match(html, /<h3>Delete Group<\/h3>/);
  assert.doesNotMatch(html, /<h3>Add Student<\/h3>/);
});

test('group rows only mark a popup choice; actions appear once for that marked group', () => {
  assert.match(js, /data-popup-group/);
  assert.match(groupsDialogJs, /id="selectedGroupActions"/);
  assert.match(groupsDialogJs, /id="selectPopupGroupBtn"/);
  assert.match(groupsDialogJs, /id="deleteSelectedGroupBtn"/);
  assert.match(js, /markPopupGroup\(/);
  assert.match(js, /selectManagedGroup\(popupSelectedGroup\)/);
  assert.match(js, /deleteGroupWithBackup\(deletionTargetGroup\)/);
  assert.doesNotMatch(js, /data-delete-group/);
  assert.doesNotMatch(html, /data-delete-group/);
  assert.doesNotMatch(js, /data-edit-group-evaluation/);
});

test('double click in Groups marks and selects the group immediately', () => {
  assert.match(js, /groupsTableBody\.addEventListener\("dblclick"/);
  assert.match(js, /markPopupGroup\(groupName\)/);
  assert.match(js, /selectManagedGroup\(groupName\)/);
});

test('Groups popup requires an explicit Select action before changing the active group', () => {
  assert.match(groupsDialogJs, /<dialog id="groupsDialog">/);
  assert.match(groupsDialogJs, /id="selectPopupGroupBtn"[^>]*>Select<\/button>/);
  assert.match(groupsDialogJs, /Click a group to mark it, then use Select to make it the active group\./);
  assert.match(js, /let popupSelectedGroup = ""/);
  assert.match(js, /function markPopupGroup\(groupName\)/);
  assert.match(js, /data-popup-group/);
  assert.match(js, /selectPopupGroupBtn\.addEventListener\("click"/);
  assert.match(js, /selectManagedGroup\(popupSelectedGroup\)/);
  assert.doesNotMatch(js, /selectedManagedGroup === groupName[\s\S]{0,180}rosterCollapsed = !rosterCollapsed/);
});

test('Group Management persists a group-specific active block from a popup', () => {
  assert.match(html, /id="activeEvaluationBlockBtn"/);
  assert.match(html, /<dialog id="activeEvaluationBlockDialog">/);
  assert.match(html, /id="activeEvaluationBlockSelect"/);
  assert.match(html, /id="saveActiveEvaluationBlockBtn"/);

  for (const source of [js, liveJs]) {
    assert.match(source, /activeEvaluationBlockForGroup/);
    assert.match(source, /function openActiveEvaluationBlockDialog/);
    assert.match(source, /function saveActiveEvaluationBlock/);
    assert.match(source, /groups\/\$\{groupName\}\/activeEvaluationBlock/);
    assert.match(source, /updates\["settings\/activeBlock"\] = selectedBlock/);
    assert.match(source, /renderActiveEvaluationBlockControl/);
  }
});

test('Group Management contains the canonical student progress matrix', () => {
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
test('pending request actions remain separate while enrolled students have no contextual action ribbon', () => {
  assert.match(html, /id="pendingRequestActions"[^>]*hidden/);
  assert.match(html, /id="approveEnrollmentBtn"/);
  assert.match(html, /id="denyEnrollmentBtn"/);
  assert.doesNotMatch(html, /id="selectedRosterActions"|id="openSelectedStudentBtn"|id="saveExternalIdBtn"|id="expelStudentBtn"/);
  assert.match(js, /renderPendingRequestActions/);
  assert.match(js, /pendingRequestActions\.hidden = requests\.length === 0/);
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
  assert.match(enrollHtml, /Request Group Enrollment/);
  assert.match(enrollJs, /status: "pending"/);
  assert.match(enrollJs, /groups\/\$\{groupName\}/);
  assert.match(enrollJs, /groupEnrollmentRequests\/\$\{groupName\}/);
});

test('Delete Group targets the group marked in the popup without activating it', () => {
  assert.match(js, /function openDeleteGroupDialog\(\)[\s\S]*const groupName = popupSelectedGroup/);
  assert.match(js, /deletionTargetGroup = groupName/);
  assert.match(js, /confirmDeleteGroupBtn\.addEventListener\("click"[\s\S]*deleteGroupWithBackup\(deletionTargetGroup\)/);
});

test('group deletion uses a visible confirmation dialog and primary delete is not blocked by cleanup', () => {
  assert.match(html, /<dialog id="deleteGroupDialog">/);
  assert.match(html, /id="deleteGroupConfirmInput"/);
  assert.match(html, /id="confirmDeleteGroupBtn"[^>]*>Delete Group<\/button>/);
  assert.match(html, /id="cancelDeleteGroupBtn"[^>]*>Cancel<\/button>/);
  assert.match(js, /function openDeleteGroupDialog/);
  assert.match(js, /Group name does not match\./);
  assert.match(js, /triggerJsonDownload/);
  assert.match(js, /await set\(ref\(db, `groups\/\$\{groupName\}`\), null\)/);
  assert.match(js, /Promise\.allSettled/);
  assert.match(js, /cleanupDeletedGroupPaths/);
  assert.match(js, /Could not delete group:/);
  assert.match(js, /deleteSelectedGroupBtn\.addEventListener\("click", openDeleteGroupDialog\)/);

  const backupIndex = js.indexOf('triggerJsonDownload(');
  const primaryDeleteIndex = js.indexOf('await set(ref(db, `groups/${groupName}`), null)');
  const cleanupIndex = js.indexOf('await cleanupDeletedGroupPaths(');
  assert.ok(backupIndex >= 0 && primaryDeleteIndex > backupIndex && cleanupIndex > primaryDeleteIndex);
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
  assert.match(groupsDialogJs, /id="openGroupEvaluationDialogBtn"[^>]*>Blocks &amp; Criteria<\/button>/);
  assert.match(js, /function openSelectedGroupEvaluationDialog/);
  assert.match(js, /groupEditorDialog\.showModal\(\)/);
  assert.match(js, /groupEditorTitle\.textContent = `Blocks & Criteria:/);
  assert.doesNotMatch(html, /id="toggleEvaluationBtn"/);
  assert.doesNotMatch(js, /EVALUATION_PANEL_STATE_KEY/);
});

test('Enrolled Students header keeps inline link controls left of Active enrollment link', () => {
  const start = html.indexOf('<section class="panel-card full-width-card" id="enrolledStudentsSection">');
  const end = html.indexOf('<div id="enrollmentControls"', start);
  const header = html.slice(start, end);
  assert.match(header, /id="enrollmentLinkInlineControls"/);
  assert.match(header, /id="enrollmentLinkInput"/);
  assert.match(header, /id="copyEnrollmentLinkBtn"[^>]*>Copy link<\/button>/);
  assert.match(header, /id="rotateEnrollmentLinkBtn"[^>]*>Rotate link<\/button>/);
  assert.match(header, /id="createEnrollmentLinkBtn"[^>]*>Active enrollment link<\/button>/);
  assert.ok(header.indexOf('enrollmentLinkInput') < header.indexOf('createEnrollmentLinkBtn'));
  assert.ok(header.indexOf('copyEnrollmentLinkBtn') < header.indexOf('createEnrollmentLinkBtn'));
  assert.ok(header.indexOf('rotateEnrollmentLinkBtn') < header.indexOf('createEnrollmentLinkBtn'));
  assert.match(js, /copyEnrollmentLinkBtn\.addEventListener\("click", copyEnrollmentLink\)/);
  assert.match(js, /navigator\.clipboard\.writeText\(link\)/);
  assert.match(js, /enrollmentLinkInlineControls\.hidden = !\(active && enrollmentLinkExpanded\)/);
});
test('student list controls share the Enrolled Students header line', () => {
  const start = html.indexOf('<section class="panel-card full-width-card" id="enrolledStudentsSection">');
  const end = html.indexOf('<div id="enrollmentControls"', start);
  const header = html.slice(start, end);
  for (const id of [
    'managedStudentDisplayModeBtn',
    'managedStudentsCount',
    'managedStudentSearchToggle',
    'managedStudentSearchPanel',
    'managedStudentSearch',
    'openManagedBlockReportBtn'
  ]) {
    assert.match(header, new RegExp(`id="${id}"`));
  }
  assert.match(html, /\.enrolled-students-head\{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;overflow-x:auto\}/);
  assert.match(html, /\.enrolled-students-left\{display:flex;align-items:center;gap:8px;flex:0 0 auto;white-space:nowrap\}/);
  assert.match(html, /\.managed-search-tools\{display:flex;align-items:center;gap:8px;flex-wrap:nowrap\}/);
  const rosterStart = html.indexOf('<div id="enrollmentControls"', start);
  const tableStart = html.indexOf('<div class="table-wrap managed-students-table-wrap">', rosterStart);
  const rosterBeforeTable = html.slice(rosterStart, tableStart);
  assert.doesNotMatch(rosterBeforeTable, /id="managedStudentDisplayModeBtn"|id="managedStudentSearchToggle"|id="openManagedBlockReportBtn"/);
});

test('managed student identity mode is saved on the group and search remains field-independent', () => {
  assert.match(html, /id="managedStudentDisplayModeBtn"[^>]*>Names<\/button>/);
  assert.doesNotMatch(html, />Show:/);
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
  assert.match(groupsDialogJs, /id="openCreateGroupDialogBtn"[^>]*>\+ Create Group<\/button>/);
  assert.match(html, /<dialog id="groupEditorDialog">/);
  assert.match(html, /id="cancelGroupEditBtn"[^>]*>Cancel<\/button>/);
  assert.match(js, /function prepareCreateGroupDialog/);
  assert.match(js, /openCreateGroupDialogBtn\.addEventListener\("click", \(\) => \{/);
  assert.match(js, /prepareCreateGroupDialog\(\)/);
  assert.match(js, /cancelGroupEditBtn\.addEventListener\("click", \(\) => groupEditorDialog\.close\(\)\)/);
  assert.match(html, /class="modal-tab active" aria-selected="true">Manual<\/button>/);
  assert.match(html, /\.modal-tabs \.modal-tab\.active::before\{content:"✓ "/);
  assert.match(js, /button\.setAttribute\("aria-selected", String\(isActive\)\)/);
});



test('Group Management enrolled student rows are double-click only and have no contextual student ribbon', () => {
  assert.doesNotMatch(html, /id="openSelectedStudentBtn"|id="saveExternalIdBtn"|id="expelStudentBtn"|id="externalIdEditor"/);
  assert.doesNotMatch(js, /managedStudentsTableBody\.addEventListener\("click"/);
  assert.match(js, /managedStudentsTableBody\.addEventListener\("dblclick"/);
  assert.match(js, /openStudentRecord\(String\(row\.dataset\.rosterId \|\| ""\)\)/);
  assert.doesNotMatch(js, /expelSelectedStudents|saveSelectedExternalId/);
  assert.match(html, /id="pendingRequestActions"/);
  assert.match(html, /id="approveEnrollmentBtn"/);
  assert.match(html, /id="denyEnrollmentBtn"/);
});

test('Enrolled Students header keeps count and identity toggle on the left and search input left of the right-aligned magnifier', () => {
  const start = html.indexOf('<div class="management-head enrolled-students-head">');
  const end = html.indexOf('</div>\n\n          <div id="enrollmentControls"', start);
  const header = html.slice(start, end);
  assert.match(header, /<h3>Enrolled Students<\/h3>[\s\S]*id="managedStudentsCount"[\s\S]*id="managedStudentDisplayModeBtn"/);
  assert.doesNotMatch(header, /<strong>Students<\/strong>/);
  assert.ok(header.indexOf('managedStudentSearchPanel') < header.indexOf('managedStudentSearchToggle'));
  assert.match(html, /\.managed-search-tools\{display:flex;align-items:center;gap:8px;flex-wrap:nowrap\}/);
});


test('search and Reports swap positions in the Enrolled Students header', () => {
  const start = html.indexOf('<div class="management-head enrolled-students-head">');
  const end = html.indexOf('</div>\n\n          <div id="enrollmentControls"', start);
  const header = html.slice(start, end);
  assert.ok(header.indexOf('managedStudentSearchPanel') < header.indexOf('managedStudentSearchToggle'));
  assert.ok(header.indexOf('managedStudentSearchToggle') < header.indexOf('openManagedBlockReportBtn'));
  assert.match(header, /id="openManagedBlockReportBtn"[^>]*>Reports<\/button>/);
  assert.doesNotMatch(header, />Block Report<\/button>/);
});


test('group deletion does not require a Firebase root read and supports permission-safe deletion fallback', () => {
  assert.match(js, /function loadGroupDeletionRoot\(groupName\)/);
  assert.doesNotMatch(js, /get\(ref\(db\)\)/);
  assert.match(js, /readDeletionBranch\("students", \{\}\)/);
  assert.match(js, /isPermissionDeniedError/);
  assert.match(js, /markGroupDeleted\(groupName\)/);
  assert.match(js, /deleted: true/);
});


test('Group Management confirms attendance only for green students in the selected group', () => {
  assert.match(html, /id="takeAttendanceBtn"[^>]*>Take Attendance<\/button>/);
  assert.match(js, /function takeAttendanceForGreenStudents\(\)/);
  assert.match(js, /groupStudents\(groupName\)[\s\S]*filter\(\(\[, student\]\) => student\?\.activeNow === true\)/);
  assert.match(js, /attendanceValidated/);
  assert.match(js, /present/);
  assert.match(js, /confirmedBy/);
  assert.match(js, /takeAttendanceBtn\.addEventListener\("click", takeAttendanceForGreenStudents\)/);
});

test('copying the enrollment link collapses the visible link field', () => {
  const start = js.indexOf('async function copyEnrollmentLink()');
  const end = js.indexOf('function openStudentRecord', start);
  const block = js.slice(start, end);
  assert.match(block, /navigator\.clipboard\.writeText\(link\)/);
  assert.match(block, /enrollmentLinkExpanded = false/);
  assert.match(block, /persistManagementState\(\)/);
  assert.match(block, /renderEnrollmentLink\(\)/);
});

test('Add Students can enroll existing accounts without creating duplicates', () => {
  assert.match(html, /id="existingStudentTabBtn"[^>]*>Existing<\/button>/);
  assert.match(html, /id="existingStudentSearch"/);
  assert.match(html, /id="existingStudentGroupFilter"/);
  assert.match(html, /id="existingStudentsMasterCheckbox"/);
  assert.match(html, /id="enrollExistingStudentsBtn"[^>]*>Enroll Selected<\/button>/);
  assert.match(js, /function existingStudentCandidates\(\)/);
  assert.match(js, /student\?\.groupName/);
  assert.match(js, /student\?\.studentNumber/);
  assert.match(js, /student\?\.externalId/);
  assert.match(js, /student\?\.nickname/);
  assert.ok(js.includes('updates[`students/${studentKey}/groupMemberships/${targetGroup}`] = true'));
  assert.doesNotMatch(js, /updates\[`students\/\$\{studentKey\}\/groupName`\] = targetGroup/);
  assert.ok(js.includes('updates[`students/${studentKey}/enrollmentSource`] = "teacher-existing"'));
  assert.match(js, /existingStudentsMasterCheckbox\.addEventListener\("change"/);
});

test('Enrolled Students header uses compact controls across the complete row', () => {
  assert.match(html, /\.enrolled-students-head button\{min-height:30px;padding:5px 8px;font-size:11px/);
  assert.match(html, /\.enrollment-link-inline-controls input\{width:min\(260px,25vw\)/);
  assert.match(html, /\.managed-search-toggle\{min-width:32px!important;min-height:30px!important/);
});


test('Existing enrollment preserves the primary group and supports multiple memberships', () => {
  assert.match(js, /studentGroupNames, studentInGroup/);
  assert.match(js, /studentInGroup\(student, targetGroup\)/);
  assert.match(js, /groupMemberships\/\$\{targetGroup\}/);
  assert.doesNotMatch(js, /previousGroupName\`\] = previousGroupName/);
  assert.match(js, /studentGroupNames\(student\)\.join\(" · "\)/);
});

test('double clicking any group row activates that group and updates working-group context', () => {
  assert.match(groupsDialogJs, /data-popup-group-row=/);
  assert.match(js, /groupRow\?\.dataset\.popupGroupRow/);
  assert.match(js, /selectManagedGroup\(groupName\)/);
  const start = js.indexOf('function selectManagedGroup(groupName)');
  const end = js.indexOf('function groupStudents', start);
  const block = js.slice(start, end);
  assert.match(block, /sessionStorage\.setItem\(WORKING_GROUP_KEY, groupName\)/);
  assert.match(block, /youteach:working-group-changed/);
});


test('group deletion removes only the target membership when students belong to other groups', () => {
  assert.match(js, /planStudentRemovalFromGroup/);
  assert.match(js, /studentInGroup\(student, groupName\)/);
  assert.match(js, /deletedStudentKeys\.has\(studentKey\)/);
  assert.doesNotMatch(js, /updates\[\`students\/\$\{studentKey\}\`\] = null/);
});


test('Group Management roster is always visible and has no collapse control', () => {
  assert.doesNotMatch(html, /id="toggleRosterBtn"|class="collapse-btn"/);
  assert.doesNotMatch(liveJs, /rosterCollapsed|toggleRosterBtn|rosterBody\.hidden\s*=/);
  assert.doesNotMatch(js, /rosterCollapsed|toggleRosterBtn|rosterBody\.hidden\s*=/);
  assert.match(html, /<div id="rosterBody">/);
});

test('Group Management regression tests cover the script actually loaded by the route', () => {
  assert.match(html, /src="teacher-enrollment\.js/);
  assert.match(liveJs, /function renderManagedStudents/);
});


test('Group Management uses the canonical shared Groups dialog module', () => {
  assert.equal(existsSync(groupsDialogPath), true);
  assert.match(js, /import \{ ensureGroupsDialog, renderGroupsDialog \} from "\.\/groups-dialog\.js"/);
  assert.match(js, /ensureGroupsDialog\(\);/);
  assert.match(js, /renderGroupsDialog\(\{/);
  assert.doesNotMatch(html, /<dialog id="groupsDialog">/);
  assert.match(groupsDialogJs, /class="group-select-button"/);
  assert.match(groupsDialogJs, /id="openCreateGroupDialogBtn"/);
  assert.match(groupsDialogJs, /id="openGroupEvaluationDialogBtn"/);
  assert.match(groupsDialogJs, /id="deleteSelectedGroupBtn"/);
});


test('shared Groups dialog management actions resume in Group Management', () => {
  assert.match(groupsDialogJs, /managementUrl\("create"\)/);
  assert.match(groupsDialogJs, /managementUrl\("evaluation", groupName\)/);
  assert.match(groupsDialogJs, /managementUrl\("delete", groupName\)/);
  assert.match(js, /REQUESTED_GROUP_ACTION/);
  assert.match(js, /maybeHandleRequestedGroupAction/);
  assert.match(js, /REQUESTED_GROUP_NAME/);
  assert.match(js, /prepareCreateGroupDialog\(\)/);
  assert.match(js, /openSelectedGroupEvaluationDialog\(\)/);
  assert.match(js, /openDeleteGroupDialog\(\)/);
});


test('evaluation autosave stays bound to the group opened in Blocks & Criteria', () => {
  const saveStart = js.indexOf('async function saveExistingGroupEvaluation');
  const saveEnd = js.indexOf('function scheduleExistingGroupEvaluationSave', saveStart);
  const saveBlock = js.slice(saveStart, saveEnd);
  assert.match(saveBlock, /groupName\s*=\s*editingGroupName/);

  const scheduleStart = js.indexOf('function scheduleExistingGroupEvaluationSave');
  const scheduleEnd = js.indexOf('function selectManagedGroup', scheduleStart);
  const scheduleBlock = js.slice(scheduleStart, scheduleEnd);
  assert.match(scheduleBlock, /const groupName = editingGroupName/);
  assert.match(scheduleBlock, /saveExistingGroupEvaluation\(groupName\)/);

  const groupsListenerStart = js.indexOf('onValue(ref(db, "groups")');
  const groupsListenerEnd = js.indexOf('onValue(ref(db, TEMPLATE_LIBRARY_PATH)', groupsListenerStart);
  const groupsListener = js.slice(groupsListenerStart, groupsListenerEnd);
  assert.match(
    groupsListener,
    /!creatingGroup\s*&&\s*!groupEditorDialog\.open\s*&&\s*editingGroupName\s*!==\s*selectedManagedGroup/
  );
});
