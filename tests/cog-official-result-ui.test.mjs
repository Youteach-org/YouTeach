import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('official result endpoint is feature gated and never trusts client scorePercent',()=>{
  const source=read('functions/api/cog-result-submit.js');
  assert.match(source,/officialCogResultsEnabled/);
  assert.match(source,/evaluateOfficialCogAttempt/);
  assert.doesNotMatch(source,/earnedPoints\s*=\s*.*body\.scorePercent/);
  assert.match(source,/saveOfficialCogResult/);
  assert.match(source,/assignmentSubmissions/);
  assert.match(source,/display cache/);
});

test('resolver issues an in-memory submission token only when official results are enabled',()=>{
  const source=read('functions/api/cog-launch-resolve.js');
  assert.match(source,/officialCogResultsEnabled/);
  assert.match(source,/signCogResultToken/);
  assert.match(source,/submissionToken/);
});

test('student assignment UI shows official COG score and supports server-side undo',()=>{
  const source=read('student-assignments.js');
  assert.match(source,/submissionType\s*===\s*["']cog["']/);
  assert.match(source,/officialScorePercent/);
  assert.match(source,/earnedPoints/);
  assert.match(source,/\/api\/cog-result-undo/);
  assert.match(source,/Authorization/);
});

test('teacher assignment UI renders COG results without pretending they are PDFs',()=>{
  const source=read('teacher-assignments.js');
  assert.match(source,/submissionType\s*===\s*["']cog["']/);
  assert.match(source,/officialScorePercent/);
  assert.match(source,/earnedPoints/);
  assert.match(source,/COG result/);
});
