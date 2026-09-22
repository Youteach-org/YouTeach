import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'points.html'), 'utf8');
const js = readFileSync(join(root, 'teacher-points.js'), 'utf8');

test('Points page exposes real point adjustment controls before legacy tools', () => {
  assert.match(html, /id="activePointsGroup"/);
  assert.match(html, /id="pointStudentSearch"/);
  assert.match(html, /id="pointStudentSelect"/);
  assert.match(html, /id="pointBlockSelect"/);
  assert.match(html, /id="pointAmountInput"/);
  assert.match(html, /id="addPointsBtn"[^>]*>Add Points<\/button>/);
  assert.match(html, /id="subtractPointsBtn"[^>]*>Subtract Points<\/button>/);
  assert.match(html, /id="setPointsBtn"[^>]*>Set Points<\/button>/);
  assert.ok(html.indexOf('Point Adjustment') < html.indexOf('Legacy Grade Sheet Import'));
});

test('Points adjustments are scoped to the active group and multi-group memberships', () => {
  assert.match(js, /const WORKING_GROUP_KEY = "youteachWorkingGroup"/);
  assert.match(js, /sessionStorage\.getItem\(WORKING_GROUP_KEY\)/);
  assert.match(js, /studentInGroup\(student, groupName\)/);
  assert.match(js, /studentPrimaryDisplay/);
  assert.match(js, /youteach:working-group-changed/);
});

test('Points adjustments honor closed blocks and write audit history', () => {
  assert.match(js, /settingsCache\?\.closedBlocks/);
  assert.match(js, /push\(ref\(db, "pointsLog"\)\)/);
  assert.match(js, /operation,/);
  assert.match(js, /previousPoints:/);
  assert.match(js, /newPoints:/);
  assert.match(js, /appliedAt: Date\.now\(\)/);
});

test('Legacy import and export tools remain available', () => {
  assert.match(html, /Legacy Grade Sheet Import/);
  assert.match(html, /Legacy CSV Export/);
  assert.match(html, /Delete Grades by Block/);
  assert.match(js, /function saveGrades\(\)/);
  assert.match(js, /function exportGrades\(\)/);
  assert.match(js, /function deleteGradesByBlock\(\)/);
});
