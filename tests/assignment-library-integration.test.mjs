import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const teacherJs = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const teacherHtml = readFileSync(join(root, 'teacher-assignments.html'), 'utf8');

test('teacher assignments exposes minimal Assignment Library controls', () => {
  assert.match(teacherHtml, /id="saveSelectedTemplateBtn"/);
  assert.match(teacherHtml, /id="assignmentTemplateSource"/);
  assert.match(teacherHtml, /id="loadAssignmentTemplateBtn"/);
  assert.match(teacherHtml, /id="assignmentTemplateStatus"/);
});

test('teacher assignments subscribes to reusable templates', () => {
  assert.match(teacherJs, /let assignmentTemplatesCache = \{\};/);
  assert.match(teacherJs, /onValue\(ref\(db, "assignmentTemplates"\)/);
  assert.match(teacherJs, /function renderAssignmentTemplateOptions\(/);
});

test('saving a selected assignment persists a reusable template record', () => {
  assert.match(teacherJs, /buildAssignmentTemplateRecord/);
  assert.match(teacherJs, /async function saveSelectedAssignmentAsTemplate\(/);
  assert.match(teacherJs, /push\(ref\(db, "assignmentTemplates"\)\)/);
  assert.match(teacherJs, /set\(target, template\)/);
});

test('loading a template fills the existing create form without run-specific values', () => {
  assert.match(teacherJs, /function loadSelectedAssignmentTemplate\(/);
  assert.match(teacherJs, /loadedAssignmentTemplateId = templateId/);
  assert.match(teacherJs, /assignmentDueAt\.value = ""/);
  assert.match(teacherJs, /projectCheckpointRows\.innerHTML = ""/);
});

test('creating from a template writes instance and usage count atomically', () => {
  assert.match(teacherJs, /buildAssignedInstanceFromTemplate/);
  assert.match(teacherJs, /templateSnapshot/);
  assert.match(teacherJs, /const multiLocationUpdates = \{\};/);
  assert.match(teacherJs, /multiLocationUpdates\[`assignments\/\$\{target\.key\}`\]/);
  assert.match(teacherJs, /multiLocationUpdates\[`assignmentTemplates\/\$\{loadedAssignmentTemplateId\}\/usageCount`\]/);
  assert.match(teacherJs, /await update\(ref\(db\), multiLocationUpdates\);/);
});
