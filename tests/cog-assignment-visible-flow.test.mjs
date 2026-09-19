import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const teacher = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const student = readFileSync(join(root, 'student-assignments.js'), 'utf8');
const studentHtml = readFileSync(join(root, 'student-assignments.html'), 'utf8');

test('teacher cards treat COG assignments as automatic-game work, not PDF grading', () => {
  assert.match(teacher, /const cogAssignment = isCogAssignment\(assignment\)/);
  assert.match(teacher, /COG automatic result/);
  assert.match(teacher, /cog-config-chip/);
  assert.match(teacher, /openDriveFolderBtn\.hidden = cogAssignment/);
});

test('student assignment card launches COG practice with assigned configuration', () => {
  assert.match(student, /function cogAssignmentHtml/);
  assert.match(student, /data-open-cog-assignment/);
  assert.match(student, /purpose:\s*"assignment-practice"/);
  assert.match(student, /officialSubmissionAllowed:\s*false/);
  assert.match(student, /modeId:/);
  assert.match(student, /difficultyId:/);
});

test('student COG card has dedicated visible styling', () => {
  assert.match(studentHtml, /\.cog-assignment-box/);
  assert.match(studentHtml, /\.cog-open-btn/);
});
