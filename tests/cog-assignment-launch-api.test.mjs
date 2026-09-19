import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const api=readFileSync(join(root,'functions/api/cog-assignment-launch.js'),'utf8');
const student=readFileSync(join(root,'student-assignments.js'),'utf8');

test('COG practice launch token is created server-side from stored assignment config',()=>{
  assert.match(api,/export async function onRequestPost/);
  assert.match(api,/officialSubmissionAllowed:\s*false/);
  assert.match(api,/purpose:\s*"assignment-practice"/);
  assert.match(api,/cogActivity:\s*\{/);
  assert.match(api,/launchTokens/);
});

test('server validates student identity and group before issuing launch token',()=>{
  assert.match(api,/expectedExternalId/);
  assert.match(api,/Student identity does not match/);
  assert.match(api,/assignmentGroup !== "ALL"/);
});

test('student uses server launch endpoint instead of writing launch tokens directly',()=>{
  assert.match(student,/fetch\("\/api\/cog-assignment-launch"/);
  assert.doesNotMatch(student,/classroomGames\/verbRunnerV2\/launchTokens\/\$\{token\}/);
});
