import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const js = readFileSync(join(root, 'student-assignments.js'), 'utf8');
const html = readFileSync(join(root, 'student-assignments.html'), 'utf8');

test('student assignment UI recognizes COG assignments and does not render PDF upload controls for them', () => {
  assert.match(js, /function isCogAssignment\(assignment\)/);
  assert.match(js, /data-open-cog-assignment=/);
  assert.match(js, /COG activity/);
  assert.match(js, /const cogAssignment = isCogAssignment\(assignment\)/);\n  assert.match(js, /if \(cogAssignment\)/);
  assert.match(html, /\.cog-assignment-box\{/);
});

test('student can open COG practice even after the assignment deadline', () => {
  assert.match(js, /Practice remains available after the due date/);
  assert.doesNotMatch(js, /data-open-cog-assignment[^>]+\$\{closed \? "disabled"/);
});

test('practice launch token carries assigned COG configuration and is explicitly non-official', () => {
  assert.match(js, /purpose:\s*"assignment-practice"/);
  assert.match(js, /assignmentId,/);
  assert.match(js, /assignmentCode:/);
  assert.match(js, /cogActivity:/);
  assert.match(js, /officialSubmissionAllowed:\s*false/);
});
