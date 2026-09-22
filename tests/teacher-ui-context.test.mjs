import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shared = readFileSync(join(root, 'shared-ui-fixes.js'), 'utf8');
const moduleHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');
const moduleJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');

test('teacher pages show the active working group beside the teacher identity', () => {
  assert.match(shared, /activeGroupIdentity/);
  assert.match(shared, /sessionStorage\.getItem\("youteachWorkingGroup"\)/);
  assert.match(shared, /teacherIdentity\.insertAdjacentElement\("afterend", groupIdentity\)/);
  assert.match(shared, /youteach:working-group-changed/);
});

test('Create Assignment selects a template by clicking the card and shows only a Use label', () => {
  assert.doesNotMatch(moduleJs, /Use as base|data-use-library-item/);
  assert.match(moduleJs, /<span class="library-use-label">Use<\/span>/);
  assert.match(moduleJs, /data-library-key=/);
  assert.match(moduleJs, /event\.target\.closest\("\[data-library-key\]"\)/);
  assert.match(moduleJs, /loadLibraryEntry\(String\(card\.dataset\.libraryKey/);
  assert.match(moduleHtml, /\.library-use-label/);
});


test('active group identity reuses the existing Groups popup and removes the replacement popup', () => {
  assert.match(shared, /activeGroupIdentity/);
  assert.match(shared, /type = "button"/);
  assert.match(shared, /groupsDialog/);
  assert.match(shared, /Click a group to mark it, then use Select to make it the active group\./);
  assert.doesNotMatch(shared, /workingGroupDialog|working-group-popup\.js/);
  assert.equal(existsSync(join(root, 'working-group-popup.js')), false);
});

test('teacher work pages use the global working group instead of page-specific group selectors', () => {
  const assignmentsHtml = readFileSync(join(root, 'teacher-assignments.html'), 'utf8');
  const createHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');
  const buzzerHtml = readFileSync(join(root, 'buzzer.html'), 'utf8');
  const pointsHtml = readFileSync(join(root, 'points.html'), 'utf8');
  const blockReportHtml = readFileSync(join(root, 'teacher-block-report.html'), 'utf8');

  assert.doesNotMatch(assignmentsHtml, /id="assignmentFilterGroup"/);
  assert.doesNotMatch(createHtml, /<select id="assignmentGroup"/);
  assert.doesNotMatch(buzzerHtml, /id="groupSelect"/);
  assert.doesNotMatch(pointsHtml, /id="manualCriterionGroupSelect"|id="exportGroupSelect"|id="deleteGroupSelect"/);
  assert.doesNotMatch(blockReportHtml, /id="reportGroupSelect"/);
});
