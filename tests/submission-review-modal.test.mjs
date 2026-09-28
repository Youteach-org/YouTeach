import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const teacherJs = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const teacherHtml = readFileSync(join(root, 'teacher-assignments.html'), 'utf8');
const sourceApiPath = join(root, 'functions', 'api', 'assignment-pdf-source.js');
const sourceApi = existsSync(sourceApiPath) ? readFileSync(sourceApiPath, 'utf8') : '';

test('submitted PDFs use an in-page Review submission modal instead of the old new-tab link', () => {
  assert.match(teacherHtml, /id="reviewSubmissionDialog"/);
  assert.match(teacherHtml, /id="reviewSubmissionGradingHost"/);
  assert.match(teacherJs, /data-review-submission=/);
  assert.doesNotMatch(teacherJs, /Open submitted PDF/);
});

test('Review submission includes PDF navigation, grading context, and publication controls', () => {
  for (const id of [
    'reviewSubmissionTitle',
    'reviewSubmissionMeta',
    'reviewSubmissionPdfCanvas',
    'reviewSubmissionPrevPageBtn',
    'reviewSubmissionNextPageBtn',
    'reviewSubmissionPageLabel',
    'reviewSubmissionGradeState',
    'reviewSubmissionPublishBtn',
    'reviewSubmissionClearBtn',
    'reviewSubmissionHistory',
    'reviewSubmissionCloseBtn'
  ]) {
    assert.match(teacherHtml, new RegExp(`id="${id}"`));
  }
});

test('general assignment PDF source reads the submitted Drive file and is not restricted to exams', () => {
  assert.equal(existsSync(sourceApiPath), true, 'functions/api/assignment-pdf-source.js must exist');
  assert.match(sourceApi, /assignmentSubmissions/);
  assert.match(sourceApi, /driveFileId/);
  assert.match(sourceApi, /alt=media/);
  assert.match(sourceApi, /Content-Type": "application\/pdf"/);
  assert.doesNotMatch(sourceApi, /This assignment is not an Exam/);
});

test('Review submission renders ordinary PDFs with PDF.js and keeps exam annotations in the same modal', () => {
  assert.match(teacherJs, /fetch\("\/api\/assignment-pdf-source"/);
  assert.match(teacherJs, /window\.pdfjsLib\.getDocument/);
  assert.match(teacherJs, /reviewSubmissionPdfCanvas/);
  assert.match(teacherJs, /reviewSubmissionExamHost\.appendChild\(examAnnotationPanel\)/);
  assert.match(teacherJs, /openExamAnnotation\(studentKey\)/);
});

test('Review submission reuses current manual grading and grade lifecycle operations', () => {
  assert.match(teacherJs, /reviewSubmissionGradingHost\.appendChild\(manualGradingPanel\)/);
  assert.match(teacherJs, /renderManualGrading\(\)/);
  assert.match(teacherJs, /toggleGradePublication\(reviewSubmissionState\.studentKey\)/);
  assert.match(teacherJs, /clearManualGrade\(reviewSubmissionState\.studentKey\)/);
  assert.match(teacherJs, /gradeHistoryHtml\(submission\)/);
});
