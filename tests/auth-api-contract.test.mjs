import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('student and teacher auth endpoints require server-only credential storage',()=>{
  for(const path of [
    'functions/api/student-session.js',
    'functions/api/student-password.js',
    'functions/api/teacher-session.js',
    'functions/api/student-enrollment.js'
  ]){
    assert.equal(existsSync(new URL(path,root)),true,path+' should exist');
    assert.match(read(path),/YOUTEACH_AUTH/);
  }
});

test('teacher enrollment verifies a signed teacher session instead of browser flags',()=>{
  const source=read('functions/api/student-enrollment.js');
  assert.match(source,/verifyTeacherSession/);
  assert.match(source,/Authorization|authorization/);
  assert.doesNotMatch(source,/youteachTeacherAuth/);
});

test('legacy migration never returns or logs plaintext password values',()=>{
  const path='functions/api/auth-migrate-students.js';
  assert.equal(existsSync(new URL(path,root)),true);
  const source=read(path);
  assert.match(source,/YOUTEACH_AUTH/);
  assert.doesNotMatch(source,/console\.log\([^\n]*password/i);
  assert.match(source,/password\s*:\s*null/);
});
