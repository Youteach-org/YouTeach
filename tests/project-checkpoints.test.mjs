import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const teacherJs = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const teacherHtml = readFileSync(join(root, 'teacher-assignments.html'), 'utf8');
const studentJs = readFileSync(join(root, 'student-assignments.js'), 'utf8');
const studentHtml = readFileSync(join(root, 'student-assignments.html'), 'utf8');
const storageJs = readFileSync(join(root, 'assignment-storage.js'), 'utf8');
const evidenceApi = readFileSync(join(root, 'functions', 'api', 'project-evidence-upload.js'), 'utf8');

test('project assignments expose checkpoint configuration and teacher progress timeline', () => {
  assert.match(teacherHtml, /id="projectCheckpointBuilder"/);
  assert.match(teacherHtml, /id="projectProgressPanel"/);
  assert.match(teacherJs, /projectCheckpoints:/);
  assert.match(teacherJs, /function collectProjectCheckpoints/);
  assert.match(teacherJs, /function renderProjectProgress/);
});

test('student project evidence is additive and separate from final PDF submission', () => {
  assert.match(storageJs, /fetch\("\/api\/drive-upload-session"/);
  assert.match(storageJs, /fetch\("\/api\/project-evidence-upload"/);
  assert.match(studentJs, /uploadProjectEvidence/);
  assert.match(studentJs, /assignmentProjectEvidence/);
  assert.match(studentHtml, /project progress evidence/i);
});

test('project evidence API validates project checkpoints and allowed evidence types', () => {
  assert.match(evidenceApi, /This assignment is not a Project/);
  assert.match(evidenceApi, /Project checkpoint not found/);
  assert.match(evidenceApi, /requiredEvidenceTypes/);
  assert.match(evidenceApi, /does not accept/);
  assert.match(evidenceApi, /assignmentProjectEvidence/);
});

test('project evidence uses task, student, and checkpoint Drive folders', () => {
  assert.match(evidenceApi, /const task = await taskFolder/);
  assert.match(evidenceApi, /const studentFolder = await findOrCreateFolder/);
  assert.match(evidenceApi, /const checkpointFolder = await findOrCreateFolder/);
  assert.match(evidenceApi, /kind: "project-evidence"/);
});

test('teacher can review project evidence without changing the final grade', () => {
  assert.match(teacherJs, /data-review-project-evidence/);
  assert.match(teacherJs, /reviewStatus: "reviewed"/);
  assert.match(teacherJs, /teacherNote:/);
  assert.doesNotMatch(teacherJs, /toggleProjectEvidenceReview[\s\S]{0,2000}grading:/);
});
