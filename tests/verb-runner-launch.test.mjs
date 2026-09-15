import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const js=readFileSync(join(root,'student-buzzer.js'),'utf8');
const html=readFileSync(join(root,'student-buzzer.html'),'utf8');

test('student buzzer offers a credentialed Verb Runner launcher',()=>{
  assert.match(html,/id="openVerbRunnerBtn"/);
  assert.match(js,/function createVerbRunnerLaunchToken/);
  assert.match(js,/crypto\.getRandomValues/);
  assert.match(js,/classroomGames\/verbRunnerV2\/launchTokens/);
  assert.match(js,/studentKey/);
  assert.match(js,/expiresAt/);
  assert.match(js,/used:\s*false/);
});

test('launch URL exposes only opaque launch token, not student identity',()=>{
  assert.match(js,/\/Verb-Runner\/\?launch=/);
  assert.doesNotMatch(js,/Verb-Runner\/\?studentKey=/);
  assert.doesNotMatch(js,/Verb-Runner\/\?nickname=/);
  assert.doesNotMatch(js,/Verb-Runner\/\?name=/);
});
