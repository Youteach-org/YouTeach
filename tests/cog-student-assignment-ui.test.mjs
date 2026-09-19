import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const js=readFileSync(join(root,'student-assignments.js'),'utf8');
const html=readFileSync(join(root,'student-assignments.html'),'utf8');

test('student assignments recognize COG tasks and render configuration',()=>{
  assert.match(js,/function isCogAssignment\(assignment\)/);
  assert.match(js,/function cogAssignmentHtml\(assignmentId, assignment\)/);
  assert.match(js,/data-open-cog-assignment/);
  assert.match(js,/Minimum/);
  assert.match(js,/pointValue/);
});

test('student COG launch is practice-only until secure official submission exists',()=>{
  assert.match(js,/purpose:\s*"assignment-practice"/);
  assert.match(js,/officialSubmissionAllowed:\s*false/);
  assert.match(js,/launchTokens/);
});

test('COG assignment styling exists in student view',()=>{
  assert.match(html,/\.cog-assignment-box/);
  assert.match(html,/\.cog-assignment-config/);
  assert.match(html,/\.cog-open-btn/);
});
