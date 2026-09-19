import test from 'node:test';
import assert from 'node:assert/strict';

import {
  signStudentSession,
  verifyStudentSession
} from '../functions/_shared/student-session.js';
import { onRequestPost as launchCogAssignment } from '../functions/api/cog-assignment-launch.js';

const SECRET = 'test-session-secret-abcdefghijklmnopqrstuvwxyz-123456';

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

test('COG launch validates signed identity and issues practice-only assigned config', async () => {
  const now = Date.now();
  const sessionToken = await signStudentSession({
    studentKey: 'student-1',
    externalId: 'A001',
    iat: now,
    exp: now + 60_000,
    nonce: 'abc'
  }, SECRET);

  const originalFetch = globalThis.fetch;
  let writtenLaunch = null;

  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/students/student-1.json')) {
      return new Response(JSON.stringify({
        studentNumber: 'A001',
        groupName: 'G1'
      }), { status: 200 });
    }
    if (value.endsWith('/assignments/assignment-1.json')) {
      return new Response(JSON.stringify({
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
      }), { status: 200 });
    }
    if (value.includes('/classroomGames/verbRunnerV2/launchTokens/') && options.method === 'PUT') {
      writtenLaunch = JSON.parse(String(options.body || '{}'));
      return new Response('null', { status: 200 });
    }
    throw new Error('Unexpected fetch: ' + value);
  };

  try {
    const response = await launchCogAssignment({
      request: new Request('https://youteach.example/api/cog-assignment-launch', {
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
    assert.match(payload.launchUrl, /classroom-online-games\.pages\.dev\/Verb-Runner\/\?launch=/);

    assert.equal(writtenLaunch?.studentKey, 'student-1');
    assert.equal(writtenLaunch?.purpose, 'assignment-practice');
    assert.equal(writtenLaunch?.officialSubmissionAllowed, false);
    assert.equal(writtenLaunch?.assignmentId, 'assignment-1');
    assert.equal(writtenLaunch?.cogActivity?.modeId, 'sentence');
    assert.equal(writtenLaunch?.cogActivity?.difficultyId, 'medium');
    assert.equal(writtenLaunch?.cogActivity?.pointValue, 15);
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
