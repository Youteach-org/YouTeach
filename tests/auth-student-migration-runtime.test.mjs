import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const endpointUrl=new URL('functions/api/auth-migrate-students.js',root);

class FakeKV {
  constructor(){ this.map=new Map(); }
  async get(key){ return this.map.has(key) ? this.map.get(key) : null; }
  async put(key,value){ this.map.set(key,String(value)); }
  async delete(key){ this.map.delete(key); }
}

function jsonResponse(value,status=200){
  return new Response(JSON.stringify(value),{
    status,
    headers:{'Content-Type':'application/json'}
  });
}

test('bulk migration stores credentials before deleting public Firebase passwords',async()=>{
  assert.equal(existsSync(endpointUrl),true,'bulk migration endpoint should exist');
  const { onRequestPost }=await import(endpointUrl.href+'?t='+Date.now());

  const kv=new FakeKV();
  const students={
    ghost01:{studentNumber:'GHOST-01',nickname:'Ghost01',password:'ghost-pass'},
    ghost02:{studentNumber:'GHOST-02',nickname:'Ghost02',password:'ghost-pass-2'}
  };
  const calls=[];
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const method=String(options.method||'GET').toUpperCase();
    calls.push({url:String(url),method,body:String(options.body||'')});
    if(method==='GET'&&String(url).endsWith('/students.json'))return jsonResponse(students);
    if(method==='PATCH'&&String(url).includes('/students/')){
      const key=decodeURIComponent(String(url).match(/\/students\/([^/]+)\.json$/)?.[1]||'');
      const patch=JSON.parse(String(options.body||'{}'));
      if(Object.prototype.hasOwnProperty.call(patch,'password')&&patch.password===null){
        delete students[key].password;
      }
      return jsonResponse({ok:true});
    }
    return jsonResponse({error:'unexpected request'},500);
  };

  try{
    const request=new Request('https://youteach.test/api/auth-migrate-students',{
      method:'POST',
      headers:{Authorization:'Bearer bootstrap-secret'}
    });
    const response=await onRequestPost({
      request,
      env:{
        YOUTEACH_AUTH:kv,
        YOUTEACH_AUTH_BOOTSTRAP_SECRET:'bootstrap-secret'
      }
    });
    const data=await response.json();

    assert.equal(response.status,200);
    assert.equal(data.ok,true);
    assert.equal(data.migrated,2);
    assert.equal(data.pending,0);
    assert.equal(data.readyForCredentialCutover,true);
    assert.equal(students.ghost01.password,undefined);
    assert.equal(students.ghost02.password,undefined);
    assert.ok(kv.map.has('student:ghost01'));
    assert.ok(kv.map.has('student:ghost02'));
    assert.ok(kv.map.has('student-id:ghost-01'));
    assert.ok(kv.map.has('student-id:ghost-02'));
    assert.doesNotMatch(JSON.stringify([...kv.map.entries()]),/ghost-pass/);

    const firstPatch=calls.findIndex(call=>call.method==='PATCH');
    assert.ok(firstPatch>0);
    assert.ok(kv.map.size>=4);
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('bulk migration rejects an invalid bootstrap bearer before reading Firebase',async()=>{
  assert.equal(existsSync(endpointUrl),true,'bulk migration endpoint should exist');
  const { onRequestPost }=await import(endpointUrl.href+'?auth='+Date.now());
  const previousFetch=globalThis.fetch;
  let fetchCalled=false;
  globalThis.fetch=async()=>{ fetchCalled=true; return jsonResponse({}); };
  try{
    const response=await onRequestPost({
      request:new Request('https://youteach.test/api/auth-migrate-students',{
        method:'POST',
        headers:{Authorization:'Bearer wrong'}
      }),
      env:{YOUTEACH_AUTH:new FakeKV(),YOUTEACH_AUTH_BOOTSTRAP_SECRET:'right'}
    });
    assert.equal(response.status,401);
    assert.equal(fetchCalled,false);
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('preview copy-only migration keeps public passwords and does not claim cutover readiness',async()=>{
  assert.equal(existsSync(endpointUrl),true);
  const { onRequestPost }=await import(endpointUrl.href+'?copy='+Date.now());

  const kv=new FakeKV();
  const students={
    ghost01:{studentNumber:'GHOST-01',nickname:'Ghost01',password:'ghost-pass'}
  };
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const method=String(options.method||'GET').toUpperCase();
    if(method==='GET'&&String(url).endsWith('/students.json'))return jsonResponse(students);
    if(method==='PATCH')return jsonResponse({ok:true});
    return jsonResponse({error:'unexpected request'},500);
  };

  try{
    const request=new Request('https://youteach.test/api/auth-migrate-students',{
      method:'POST',
      headers:{
        Authorization:'Bearer bootstrap-secret',
        'Content-Type':'application/json'
      },
      body:JSON.stringify({removePublicPasswords:false})
    });
    const response=await onRequestPost({
      request,
      env:{
        YOUTEACH_AUTH:kv,
        YOUTEACH_AUTH_BOOTSTRAP_SECRET:'bootstrap-secret'
      }
    });
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.migrated,1);
    assert.equal(data.pending,0);
    assert.equal(data.publicCredentialFieldsRemaining,1);
    assert.equal(data.readyForCredentialCutover,false);
    assert.equal(students.ghost01.password,'ghost-pass');
    assert.ok(kv.map.has('student:ghost01'));
  }finally{
    globalThis.fetch=previousFetch;
  }
});
