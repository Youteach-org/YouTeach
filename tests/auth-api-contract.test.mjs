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

test('migration status can prove cutover readiness without handling plaintext credentials',()=>{
  const path='functions/api/auth-migration-status.js';
  assert.equal(existsSync(new URL(path,root)),true);
  const source=read(path);
  assert.match(source,/YOUTEACH_AUTH/);
  assert.match(source,/readyForCredentialCutover/);
  assert.match(source,/publicCredentialFields/);
  assert.doesNotMatch(source,/student\?\.password|student\.password/);
});