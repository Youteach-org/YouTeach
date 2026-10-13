import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'teacher-ghost-lab.html'), 'utf8');
const js = readFileSync(join(root, 'teacher-ghost-lab.js'), 'utf8');

test('Ghost Lab exposes Add Students with the same four enrollment modes', () => {
  assert.match(html, /id="openAddStudentModalBtn"[^>]*>Add Students<\/button>/);
  assert.match(html, /id="addStudentDialog"/);
  assert.match(html, /id="manualStudentTabBtn"/);
  assert.match(html, /id="csvStudentTabBtn"/);
  assert.match(html, /id="pasteStudentTabBtn"/);
  assert.match(html, /id="existingStudentTabBtn"/);
  assert.match(html, /id="existingStudentsMasterCheckbox"/);
  assert.match(html, /id="enrollExistingStudentsBtn"[^>]*>Enroll Selected<\/button>/);
});

test('Ghost Lab Add Students always targets FANTASMA without removing existing memberships', () => {
  assert.match(js, /const GHOST_GROUP = "FANTASMA"/);
  assert.ok(js.includes('groupName: GHOST_GROUP'));
  assert.ok(js.includes('groupMemberships: { [GHOST_GROUP]: true }'));
  assert.ok(js.includes('updates[`students/${studentKey}/groupMemberships/${GHOST_GROUP}`] = true'));
  assert.doesNotMatch(js, /updates\[`students\/\$\{studentKey\}\/groupName`\] = GHOST_GROUP/);
  assert.match(js, /existingStudentsMasterCheckbox\.addEventListener\("change"/);
  assert.match(js, /studentGroupNames/);
  assert.match(js, /function studentInNamedGroup\(student, groupName\)/);
  assert.match(js, /studentGroupNames\(student\)\.join\(" · "\)/);
});

test('Ghost Lab can still manually create and import students from the shared popup', () => {
  assert.match(js, /function saveStudent\(/);
  assert.match(js, /push\(ref\(db, "students"\)\)/);
  assert.match(js, /enrollmentSource: "ghost-lab-manual"/);
  assert.match(js, /enrollmentSource: "ghost-lab-csv"/);
  assert.match(js, /enrollmentSource: "ghost-lab-paste"/);
});

test('Ghost Lab identifies Ghost accounts by FANTASMA but filters them by the active working group', () => {
  assert.match(js, /const WORKING_GROUP_KEY = "youteachWorkingGroup"/);
  assert.match(js, /function activeGhostTestGroup\(\)/);
  assert.match(js, /filter\(\(\[, student\]\) => isGhostStudent\(student\)\)/);
  assert.match(js, /filter\(\(\[, student\]\) => studentInNamedGroup\(student, activeGroup\)\)/);
  assert.match(js, /function studentGroupsDisplay\(student\)/);
  assert.match(js, /studentGroupNames\(student\)/);
  assert.match(js, /const groupName = activeGhostTestGroup\(\)/);
  assert.doesNotMatch(js, /const groupName = student\?\.groupName \|\| "GENERAL"/);
});

test('Ghost Lab passes student keys to assignment eligibility checks', () => {
  assert.match(js, /assignmentAppliesToStudent\(assignment, studentKey, student\)/);
  assert.match(js, /assignmentAppliesToStudent\(assignment, key, student\)/);
  assert.doesNotMatch(js, /assignmentAppliesToStudent\(assignment, student\)/);
});

test('Ghost Lab follows the active group for assignments and reacts to group changes', () => {
  assert.match(js, /function assignmentMatchesActiveTestGroup\(assignment\)/);
  assert.match(js, /normalizeGroupName\(target\) === normalizeGroupName\(activeGhostTestGroup\(\)\)/);
  assert.match(js, /window\.addEventListener\("youteach:working-group-changed"/);
  assert.match(html, /active Working Group/);
});

test('Ghost Lab script URL is cache-busted for active-group behavior', () => {
  assert.match(html, /teacher-ghost-lab\.js\?v=ghost-active-group-20261013/);
});
