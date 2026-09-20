import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLoginId,
  createPasswordRecord,
  verifyPassword,
  putStudentCredential,
  findStudentCredential,
  putTeacherCredential,
  findTeacherCredential
} from '../functions/_shared/credential-store.js';

class FakeKV {
  constructor(){ this.map=new Map(); }
  async get(key){ return this.map.has(key) ? this.map.get(key) : null; }
  async put(key,value){ this.map.set(key,String(value)); }
  async delete(key){ this.map.delete(key); }
}

test('password records are salted hashes and verify without storing plaintext', async()=>{
  const record=await createPasswordRecord('correct horse battery staple');
  assert.equal(record.algorithm,'PBKDF2-SHA256');
  assert.equal(record.version,1);
  assert.ok(record.iterations>=200000);
  assert.ok(record.salt);
  assert.ok(record.hash);
  assert.doesNotMatch(JSON.stringify(record),/correct horse battery staple/);
  assert.equal(await verifyPassword('correct horse battery staple',record),true);
  assert.equal(await verifyPassword('wrong password',record),false);
});

test('student credentials use normalized login indexes and versioned records', async()=>{
  const kv=new FakeKV();
  await putStudentCredential(kv,{
    studentKey:'-student-key',
    externalId:'  2212-1079 ',
    password:'abc123'
  });
  const found=await findStudentCredential(kv,'2212-1079');
  assert.equal(found.studentKey,'-student-key');
  assert.equal(found.externalId,'2212-1079');
  assert.equal(found.credential.version,1);
  assert.equal(await verifyPassword('abc123',found.credential),true);
  assert.equal(normalizeLoginId('  AbC-123  '),'abc-123');
});

test('teacher credentials are stored by normalized username without exposing passwords', async()=>{
  const kv=new FakeKV();
  await putTeacherCredential(kv,{
    username:'Teacher.One',
    password:'secure-pass',
    role:'teacher',
    displayName:'Teacher One'
  });
  const found=await findTeacherCredential(kv,' teacher.one ');
  assert.equal(found.username,'teacher.one');
  assert.equal(found.role,'teacher');
  assert.equal(found.displayName,'Teacher One');
  assert.equal(await verifyPassword('secure-pass',found.credential),true);
  assert.doesNotMatch(JSON.stringify([...kv.map.entries()]),/secure-pass/);
});
