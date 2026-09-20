import test from 'node:test';
import assert from 'node:assert/strict';

import {
  officialCogResultsEnabled,
  expectedSuccessesForMode,
  evaluateOfficialCogAttempt,
  receiptExpiresAt
} from '../cog-official-result-policy.mjs';
import {
  signCogResultToken,
  verifyCogResultToken
} from '../functions/_shared/cog-result-token.js';

const SECRET='official-result-test-secret-abcdefghijklmnopqrstuvwxyz-123456';

test('official COG results stay disabled unless both production gates are explicitly true',()=>{
  assert.equal(officialCogResultsEnabled({}),false);
  assert.equal(officialCogResultsEnabled({YOUTEACH_COG_OFFICIAL_RESULTS_ENABLED:'true'}),false);
  assert.equal(officialCogResultsEnabled({YOUTEACH_AUTH_HARDENED:'true'}),false);
  assert.equal(officialCogResultsEnabled({
    YOUTEACH_COG_OFFICIAL_RESULTS_ENABLED:'true',
    YOUTEACH_AUTH_HARDENED:'true'
  }),true);
});

test('server recomputes score from successes and errors instead of trusting a client score',()=>{
  const result=evaluateOfficialCogAttempt({
    attempt:{
      assignmentId:'a1',
      gameId:'verb-runner',
      modeId:'sentence',
      difficultyId:'medium',
      successes:20,
      errors:5,
      completed:true,
      startedAt:1000,
      completedAt:61000,
      scorePercent:100
    },
    assignmentId:'a1',
    config:{
      gameId:'verb-runner',
      modeId:'sentence',
      difficultyId:'medium',
      minimumPercent:70,
      pointValue:15
    }
  });

  assert.equal(result.scorePercent,80);
  assert.equal(result.earnedPoints,12);
  assert.equal(result.meetsMinimum,true);
  assert.equal(result.expectedSuccesses,20);
});

test('final race requires 30 successes and incomplete attempts are rejected',()=>{
  assert.equal(expectedSuccessesForMode('final-race'),30);
  assert.equal(expectedSuccessesForMode('verb'),20);
  assert.throws(()=>evaluateOfficialCogAttempt({
    attempt:{
      assignmentId:'a1',
      gameId:'verb-runner',
      modeId:'final-race',
      difficultyId:'hard',
      successes:29,
      errors:1,
      completed:true,
      startedAt:1000,
      completedAt:2000
    },
    assignmentId:'a1',
    config:{
      gameId:'verb-runner',
      modeId:'final-race',
      difficultyId:'hard',
      minimumPercent:null,
      pointValue:20
    }
  }),/complete/i);
});

test('minimum performance is enforced after server score recomputation',()=>{
  const result=evaluateOfficialCogAttempt({
    attempt:{
      assignmentId:'a1',
      gameId:'verb-runner',
      modeId:'verb',
      difficultyId:'easy',
      successes:20,
      errors:10,
      completed:true,
      startedAt:1000,
      completedAt:2000
    },
    assignmentId:'a1',
    config:{
      gameId:'verb-runner',
      modeId:'verb',
      difficultyId:'easy',
      minimumPercent:70,
      pointValue:10
    }
  });
  assert.equal(result.scorePercent,67);
  assert.equal(result.meetsMinimum,false);
  assert.equal(result.earnedPoints,6.7);
});

test('result submission tokens are signed, scoped, and expire',async()=>{
  const token=await signCogResultToken({
    studentKey:'s1',
    assignmentId:'a1',
    assignmentCode:'COG-A1',
    purpose:'cog-result-submit',
    cogActivity:{
      gameId:'verb-runner',
      modeId:'sentence',
      difficultyId:'medium',
      minimumPercent:70,
      pointValue:15
    },
    iat:1000,
    exp:61000,
    nonce:'n1'
  },SECRET);

  const verified=await verifyCogResultToken(token,SECRET,2000);
  assert.equal(verified?.studentKey,'s1');
  assert.equal(verified?.assignmentId,'a1');
  assert.equal(verified?.purpose,'cog-result-submit');
  assert.equal(await verifyCogResultToken(token,SECRET,62000),null);
});

test('official receipts remain verifiable for six calendar months',()=>{
  assert.equal(
    new Date(receiptExpiresAt(Date.UTC(2026,8,19,12))).toISOString(),
    '2027-03-19T12:00:00.000Z'
  );
});
