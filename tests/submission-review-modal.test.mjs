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
    'reviewSubmissionPdfFrame',
    'reviewSubmissionOpenDriveLink',
    'reviewSubmissionGradeState',
    'reviewSubmissionPublishBtn',
    'reviewSubmissionClearBtn',
    'reviewSubmissionHistory',
    'reviewSubmissionCloseBtn'
  ]) {
    assert.match(teacherHtml, new RegExp(`id="${id}"`));
  }
});

test('ordinary assignment review does not introduce a universal server-side PDF proxy', () => {
  assert.equal(existsSync(sourceApiPath), false);
  assert.doesNotMatch(teacherJs, /\/api\/assignment-pdf-source/);
  assert.match(teacherJs, /https:\/\/drive\.google\.com\/file\/d\/\$\{encodeURIComponent\(fileId\)\}\/preview/);
  assert.match(teacherJs, /reviewSubmissionPdfFrame\.src = previewUrl \|\| "about:blank"/);
});

test('Review submission embeds ordinary Drive previews and keeps exam PDF.js annotations in the same modal', () => {
  assert.match(teacherJs, /function drivePreviewUrl\(submission\)/);
  assert.match(teacherJs, /loadReviewSubmissionDrivePreview\(submission\)/);
  assert.match(teacherJs, /reviewSubmissionPdfFrame/);
  assert.match(teacherJs, /reviewSubmissionExamHost\.appendChild\(examAnnotationPanel\)/);
  assert.match(teacherJs, /openExamAnnotation\(studentKey\)/);
  assert.match(teacherJs, /window\.pdfjsLib/);
});

test('Review submission reuses current manual grading and grade lifecycle operations', () => {
  assert.match(teacherJs, /reviewSubmissionGradingHost\.appendChild\(manualGradingPanel\)/);
  assert.match(teacherJs, /renderManualGrading\(\)/);
  assert.match(teacherJs, /toggleGradePublication\(reviewSubmissionState\.studentKey\)/);
  assert.match(teacherJs, /clearManualGrade\(reviewSubmissionState\.studentKey\)/);
  assert.match(teacherJs, /gradeHistoryHtml\(submission\)/);
});


test('manual correction over an AI grade is explicitly marked corrected and unpublished', () => {
  assert.match(
    teacherJs,
    /teacherReviewStatus: submission\?\.grading\?\.mode === "ai" \? "corrected" : "accepted"/
  );
  assert.match(teacherJs, /gradePublished: false/);
  assert.match(teacherJs, /gradePublishedAt: null/);
});

test('Review submission Clear grade can reset either an AI or manual numeric grade', () => {
  assert.match(
    teacherJs,
    /if \(!submission \|\| gradingTotalForSubmission\(submission\) === null\)/
  );
  assert.doesNotMatch(
    teacherJs,
    /if \(!submission \|\| submission\?\.grading\?\.mode !== "manual"\)/
  );
});
