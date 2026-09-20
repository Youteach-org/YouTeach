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
const resolverFn = readFileSync(join(root, 'functions', 'api', 'cog-launch-resolve.js'), 'utf8');
const sessionShared = readFileSync(join(root, 'functions', '_shared', 'student-session.js'), 'utf8');
const launchShared = readFileSync(join(root, 'functions', '_shared', 'cog-assignment-launch.js'), 'utf8');

test('student login requests a server-issued signed session', () => {
  assert.match(studentAuth, /fetch\("\/api\/student-session"/);
  assert.match(studentAuth, /youteachStudentSessionToken/);
});

test('student session is HMAC signed with a server-only environment secret', () => {
  assert.match(sessionShared, /HMAC/);
  assert.match(sessionShared, /SHA-256/);
  assert.match(sessionShared, /YOUTEACH_SESSION_SECRET/);
  assert.match(sessionFn, /env\.YOUTEACH_SESSION_SECRET/);
});

test('COG launch requires the signed YouTeach student session', () => {
  assert.match(launchFn, /Authorization/);
  assert.match(launchFn, /verifyStudentSession/);
  assert.match(launchFn, /env\.YOUTEACH_SESSION_SECRET/);
  assert.match(launchFn, /assignmentGroup !== "ALL"/);
});

test('assignment launch is separately signed and never stored in public Firebase', () => {
  assert.match(launchShared, /cog1/);
  assert.match(launchShared, /HMAC/);
  assert.match(launchFn, /signCogAssignmentLaunch/);
  assert.match(launchFn, /searchParams\.set\("assignmentLaunch"/);
  assert.doesNotMatch(launchFn, /launchTokens/);
  assert.doesNotMatch(launchFn, /firebasePut/);
});

test('COG resolver accepts only COG Pages origins and verifies the signed assignment launch', () => {
  assert.match(resolverFn, /classroom-online-games\.pages\.dev/);
  assert.match(resolverFn, /verifyCogAssignmentLaunch/);
  assert.match(resolverFn, /Access-Control-Allow-Origin/);
  assert.match(resolverFn, /officialSubmissionAllowed:\s*false/);
});

test('COG launch remains practice-only and cannot authorize an official result', () => {
  assert.match(launchFn, /purpose:\s*"assignment-practice"/);
  assert.match(launchFn, /officialSubmissionAllowed:\s*false/);
});
