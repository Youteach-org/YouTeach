import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('teacher login contains no shipped credentials and uses server session endpoint',()=>{
  const source=read('teacher-login.js');
  assert.doesNotMatch(source,/teacher123|admin123/);
  assert.doesNotMatch(source,/const\s+USERS\s*=/);
  assert.match(source,/\/api\/teacher-session/);
  assert.match(source,/youteachTeacherSession/);
});

test('student login is server-authoritative and retains a signed session token',()=>{
  const source=read('student-auth.js');
  assert.doesNotMatch(source,/student\.password\s*\|\|\s*["']1234["']/);
  assert.match(source,/\/api\/student-session/);
  assert.match(source,/youteachStudentSessionToken/);
});

test('password settings no longer read or write password fields in Firebase',()=>{
  const source=read('student-settings.js');
  assert.doesNotMatch(source,/student\.password/);
  assert.doesNotMatch(source,/\{\s*password\s*:/);
  assert.match(source,/\/api\/student-password/);
});

test('teacher enrollment does not create public plaintext passwords',()=>{
  const source=read('teacher-enrollment.js');
  assert.doesNotMatch(source,/password\s*:\s*["']1234["']/);
  assert.match(source,/\/api\/student-enrollment/);
});
