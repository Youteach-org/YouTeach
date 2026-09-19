import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const studentAuth = readFileSync(join(root, 'student-auth.js'), 'utf8');
const sessionFn = readFileSync(join(root, 'functions', 'api', 'student-session.js'), 'utf8');
const launchFn = readFileSync(join(root, 'functions', 'api', 'cog-assignment-launch.js'), 'utf8');
const shared = readFileSync(join(root, 'functions', '_shared', 'student-session.js'), 'utf8');

test('student login requests a server-issued signed session', () => {
  assert.match(studentAuth, /fetch\("\/api\/student-session"/);
  assert.match(studentAuth, /youteachStudentSessionToken/);
});

test('student session is HMAC signed with a server-only environment secret', () => {
  assert.match(shared, /HMAC/);
  assert.match(shared, /SHA-256/);
  assert.match(shared, /YOUTEACH_SESSION_SECRET/);
  assert.match(sessionFn, /env\.YOUTEACH_SESSION_SECRET/);
});

test('COG launch requires the signed YouTeach student session', () => {
  assert.match(launchFn, /Authorization/);
  assert.match(launchFn, /verifyStudentSession/);
  assert.match(launchFn, /env\.YOUTEACH_SESSION_SECRET/);
  assert.match(launchFn, /assignmentGroup !== "ALL"/);
});

test('COG launch remains practice-only and cannot authorize an official result', () => {
  assert.match(launchFn, /purpose:\s*"assignment-practice"/);
  assert.match(launchFn, /officialSubmissionAllowed:\s*false/);
});
