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
  assert.match(js, /studentGroupNames, studentInGroup/);
  assert.match(js, /studentGroupNames\(student\)\.join\(" · "\)/);
});

test('Ghost Lab can still manually create and import students from the shared popup', () => {
  assert.match(js, /function saveStudent\(/);
  assert.match(js, /push\(ref\(db, "students"\)\)/);
  assert.match(js, /enrollmentSource: "ghost-lab-manual"/);
  assert.match(js, /enrollmentSource: "ghost-lab-csv"/);
  assert.match(js, /enrollmentSource: "ghost-lab-paste"/);
});
