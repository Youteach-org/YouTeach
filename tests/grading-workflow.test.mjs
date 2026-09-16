import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const teacherJs = readFileSync(join(root, 'teacher-assignments.js'), 'utf8');
const studentJs = readFileSync(join(root, 'student-assignments.js'), 'utf8');
const syncFn = readFileSync(join(root, 'functions', 'api', 'sync-ai-grades.js'), 'utf8');

test('student grading UI never coerces null totalScore to zero', () => {
  assert.match(
    studentJs,
    /if \(raw === null \|\| raw === undefined \|\| raw === ""\) return null;/
  );
  assert.match(studentJs, /const publishedTotal = gradingTotalForSubmission\(submission\);/);
  assert.match(studentJs, /const total = gradingTotalForSubmission\(submission\);/);
  assert.doesNotMatch(studentJs, /const publishedTotal = Number\(submission\?\.grading\?\.totalScore\)/);
});

test('student only renders numeric grade after publication', () => {
  assert.match(
    studentJs,
    /if \(!submission\?\.gradePublished \|\| total === null\) return "";/
  );
  assert.match(studentJs, /Grade released/);
  assert.match(studentJs, /grade not released/);
});

test('manual grade remains unpublished when saved', () => {
  assert.match(teacherJs, /mode: "manual"/);
  assert.match(teacherJs, /gradePublished: false/);
  assert.match(teacherJs, /gradePublishedAt: null/);
  assert.match(teacherJs, /gradePublishedBy: null/);
});

test('manual correction after AI launch wins over in-flight AI result', () => {
  assert.match(
    syncFn,
    /const aiActionStartedAt = minimumResultsModifiedTime > 0\s*\? minimumResultsModifiedTime\s*:\s*aiResultsModifiedAt;/
  );
  assert.match(syncFn, /if \(manualGradedAt >= aiActionStartedAt\)/);
  assert.doesNotMatch(
    syncFn,
    /if \(!forceRegrade && submission\?\.grading\?\.mode === "manual"/
  );
});


test('legacy AI conflict labels are not rendered in the current teacher workflow', () => {
  assert.doesNotMatch(teacherJs, /Compare · Manual:/);
  assert.doesNotMatch(teacherJs, /Manual kept · AI suggestion:/);
});
