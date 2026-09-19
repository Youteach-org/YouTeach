import test from 'node:test';
import assert from 'node:assert/strict';

import {
  signStudentSession,
  verifyStudentSession
} from '../functions/_shared/student-session.js';
import {
  verifyCogAssignmentLaunch
} from '../functions/_shared/cog-assignment-launch.js';
import { onRequestPost as launchCogAssignment } from '../functions/api/cog-assignment-launch.js';
import { onRequestPost as resolveCogAssignment } from '../functions/api/cog-launch-resolve.js';

const SECRET = 'test-session-secret-abcdefghijklmnopqrstuvwxyz-123456';

function assignmentRecord() {
  return {
    assignmentTypeCode: 'COG',
    code: 'COG-VERBRU-G1-190926',
    groupName: 'G1',
    pointValue: 15,
    cogActivity: {
      gameId: 'verb-runner',
      modeId: 'sentence',
      difficultyId: 'medium',
      minimumPercent: 70,
      contractVersion: 1
    }
  };
}

test('signed student sessions verify, reject tampering and expire', async () => {
  const now = Date.now();
  const token = await signStudentSession({
    studentKey: 'student-1',
    externalId: 'A001',
    iat: now,
    exp: now + 60_000,
    nonce: 'abc'
  }, SECRET);

  const verified = await verifyStudentSession(token, SECRET, now + 1_000);
  assert.equal(verified?.studentKey, 'student-1');
  assert.equal(verified?.externalId, 'A001');

  const parts = token.split('.');
  const tampered = [parts[0], parts[1].slice(0, -1) + (parts[1].endsWith('A') ? 'B' : 'A'), parts[2]].join('.');
  assert.equal(await verifyStudentSession(tampered, SECRET, now + 1_000), null);
  assert.equal(await verifyStudentSession(token, SECRET, now + 120_000), null);
});

test('COG launch validates signed identity and returns a signed practice assignment token', async () => {
  const now = Date.now();
  const sessionToken = await signStudentSession({
    studentKey: 'student-1',
    externalId: 'A001',
    iat: now,
    exp: now + 60_000,
    nonce: 'abc'
  }, SECRET);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/students/student-1.json')) {
      return new Response(JSON.stringify({
        fullName: 'Student One',
        nickname: 'Student',
        studentNumber: 'A001',
        groupName: 'G1'
      }), { status: 200 });
    }
    if (value.endsWith('/assignments/assignment-1.json')) {
      return new Response(JSON.stringify(assignmentRecord()), { status: 200 });
    }
    throw new Error('Unexpected fetch: ' + value);
  };

  try {
    const response = await launchCogAssignment({
      request: new Request('https://preview.youteach.pages.dev/api/cog-assignment-launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + sessionToken
        },
        body: JSON.stringify({ assignmentId: 'assignment-1' })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.officialSubmissionAllowed, false);

    const launchUrl = new URL(payload.launchUrl);
    assert.equal(launchUrl.origin, 'https://classroom-online-games.pages.dev');
    assert.equal(launchUrl.pathname, '/Verb-Runner/');
    assert.equal(launchUrl.searchParams.get('issuer'), 'https://preview.youteach.pages.dev');

    const assignmentToken = launchUrl.searchParams.get('assignmentLaunch');
    assert.ok(assignmentToken);
    const launch = await verifyCogAssignmentLaunch(assignmentToken, SECRET, now + 1_000);
    assert.equal(launch?.studentKey, 'student-1');
    assert.equal(launch?.assignmentId, 'assignment-1');
    assert.equal(launch?.purpose, 'assignment-practice');
    assert.equal(launch?.officialSubmissionAllowed, false);
    assert.equal(launch?.cogActivity?.modeId, 'sentence');
    assert.equal(launch?.cogActivity?.difficultyId, 'medium');
    assert.equal(launch?.cogActivity?.pointValue, 15);

    const resolveResponse = await resolveCogAssignment({
      request: new Request('https://preview.youteach.pages.dev/api/cog-launch-resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://classroom-online-games.pages.dev'
        },
        body: JSON.stringify({ token: assignmentToken })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });

    assert.equal(resolveResponse.status, 200);
    assert.equal(
      resolveResponse.headers.get('Access-Control-Allow-Origin'),
      'https://classroom-online-games.pages.dev'
    );
    const resolved = await resolveResponse.json();
    assert.equal(resolved.ok, true);
    assert.equal(resolved.identity.studentKey, 'student-1');
    assert.equal(resolved.identity.nickname, 'Student');
    assert.equal(resolved.launchContext.assignmentId, 'assignment-1');
    assert.equal(resolved.launchContext.cogActivity.modeId, 'sentence');
    assert.equal(resolved.launchContext.officialSubmissionAllowed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('COG launch rejects a missing signed student session before Firebase access', async () => {
  const response = await launchCogAssignment({
    request: new Request('https://youteach.example/api/cog-assignment-launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: 'assignment-1' })
    }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.ok, false);
});

test('COG resolver rejects untrusted web origins before reading assignment data', async () => {
  const response = await resolveCogAssignment({
    request: new Request('https://youteach.example/api/cog-launch-resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example'
      },
      body: JSON.stringify({ token: 'not-used' })
    }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });

  assert.equal(response.status, 403);
});
