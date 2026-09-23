import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const teacherJs = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const teacherHtml = readFileSync(join(root, 'teacher-assignments.html'), 'utf8');
const moduleJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');
const moduleHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');

test('Assignment Library is inside Create Assignment popup, not the Assignments page', () => {
  assert.match(moduleHtml, /id="createFromScratchBtn"/);
  assert.match(moduleHtml, /id="createFromLibraryBtn"/);
  assert.match(moduleHtml, /id="assignmentLibraryPanel"/);
  assert.doesNotMatch(teacherHtml, /<section id="assignmentLibraryPanel"/);
  assert.match(teacherHtml, /id="assignmentLibraryCompatibility" hidden/);
});

test('popup library can reuse real previous assignments and saved library items', () => {
  assert.match(moduleJs, /kind: "assignment"/);
  assert.match(moduleJs, /kind: "template"/);
  assert.match(moduleJs, /sourceAssignmentId/);
  assert.match(moduleJs, /templateId: loadedLibrarySource\.id/);
  assert.match(moduleJs, /onValue\(ref\(db, "assignmentTemplates"\)/);
  assert.match(moduleJs, /onValue\(ref\(db, "assignments"\)/);
});

test('reusing a source copies academic content but clears run-specific due date', () => {
  assert.match(moduleJs, /function reusableContentFromAssignment\(/);
  assert.match(moduleJs, /assignmentDueAt\.value = ""/);
  assert.match(moduleJs, /reusableProjectCheckpoints/);
  assert.match(moduleJs, /evaluationCriteria/);
  assert.match(moduleJs, /evaluationNotes/);
});

test('template usage metadata is retained when a saved library item is used', () => {
  assert.match(moduleJs, /templateVersion/);
  assert.match(moduleJs, /templateSnapshot/);
  assert.match(moduleJs, /usageCount: Number\(sourceTemplate\.usageCount \|\| 0\) \+ 1/);
});

test('legacy template model remains available without visible main-page library UI', () => {
  assert.match(teacherJs, /buildAssignmentTemplateRecord/);
  assert.match(teacherJs, /buildAssignedInstanceFromTemplate/);
});


test('Assignment Library group filter exists everywhere the renderer expects it', () => {
  assert.match(moduleHtml, /id="assignmentLibraryGroupFilter"/);
  assert.match(moduleJs, /const assignmentLibraryGroupFilter = document\.getElementById\("assignmentLibraryGroupFilter"\)/);
  assert.match(moduleJs, /replaceLibraryOptions\(assignmentLibraryGroupFilter, entries\.map\(\(entry\) => entry\.groupName\), "All groups"\)/);
  assert.match(moduleJs, /assignmentLibraryGroupFilter\.addEventListener\("change", renderAssignmentLibrary\)/);
  assert.match(moduleJs, /assignmentLibraryGroupFilter\.value = ""/);
});


test('Create Assignment popup cache-busts the current module revision', () => {
  assert.match(
    moduleHtml,
    /assignment-create-module\.js\?v=planning-unsaved-instructions-20260922/
  );
});
