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
const uploadFn = readFileSync(join(root, 'functions', 'api', 'drive-upload-session.js'), 'utf8');
const sourceApi = readFileSync(join(root, 'functions', 'api', 'exam-pdf-source.js'), 'utf8');
const uploadApi = readFileSync(join(root, 'functions', 'api', 'exam-annotation-upload.js'), 'utf8');
const studentApi = readFileSync(join(root, 'functions', 'api', 'exam-annotated-pdf-source.js'), 'utf8');

test('teacher exam annotation editor only targets exam submissions', () => {
  assert.match(teacherHtml, /id="examAnnotationPanel"/);
  assert.match(teacherJs, /function isExamAssignment\(assignment\)/);
  assert.match(teacherJs, /data-annotate-exam/);
  assert.match(sourceApi, /This assignment is not an Exam/);
  assert.match(uploadApi, /This assignment is not an Exam/);
});

test('exam annotations preserve the original PDF and save a derivative', () => {
  assert.match(sourceApi, /alt=media/);
  assert.match(uploadApi, /--graded\.pdf/);
  assert.match(uploadApi, /kind: "annotated-exam"/);
  assert.match(teacherJs, /Original submission was not modified/);
  assert.doesNotMatch(uploadApi, /submission\.driveFileId[^\n]*fileId:/);
});

test('exam annotation metadata stores page coordinates and per-question details', () => {
  assert.match(teacherJs, /page: examAnnotationState\.page/);
  assert.match(teacherJs, /question: examQuestionNumber\.value\.trim\(\)/);
  assert.match(teacherJs, /points,/);
  assert.match(teacherJs, /comment: examQuestionComment\.value\.trim\(\)/);
  assert.match(teacherJs, /examAnnotationPointsTotal/);
});

test('resubmitting the original exam invalidates stale annotations and derivative', () => {
  assert.match(uploadFn, /submission\?\.examAnnotatedDriveFileId/);
  assert.match(uploadFn, /deleteDriveFile\(accessToken, submission\.examAnnotatedDriveFileId\)/);
  assert.match(uploadFn, /examAnnotations: null/);
  assert.match(uploadFn, /examAnnotatedDriveFileId: null/);
});

test('students can access annotated exams only after publication', () => {
  assert.match(studentApi, /if \(!submission\.gradePublished\)/);
  assert.match(studentApi, /The graded exam has not been published yet/);
  assert.match(studentJs, /data-open-graded-exam/);
  assert.match(studentJs, /\/api\/exam-annotated-pdf-source/);
});

test('teacher uses PDF.js for viewing and pdf-lib for derivative generation', () => {
  assert.match(teacherHtml, /pdf\.min\.js/);
  assert.match(teacherHtml, /pdf-lib\.min\.js/);
  assert.match(teacherJs, /window\.pdfjsLib\.getDocument/);
  assert.match(teacherJs, /PDFDocument\.load/);
});


test('submission resubmission resets current grade while preserving an audit event', () => {
  assert.match(uploadFn, /function revisionGradeResetPatch/);
  assert.match(uploadFn, /"submission-resubmitted"/);
  assert.match(uploadFn, /"submission-withdrawn"/);
  assert.match(uploadFn, /grading: null/);
  assert.match(uploadFn, /gradePublished: false/);
  assert.match(uploadFn, /gradingHistory\/\$\{historyKey\}/);
});

test('withdrawal removes both original submission and annotated derivative', () => {
  assert.match(uploadFn, /deleteDriveFile\(accessToken, existingFile\?\.id \|\| ""\)/);
  assert.match(uploadFn, /deleteDriveFile\(accessToken, submission\.examAnnotatedDriveFileId\)/);
});
