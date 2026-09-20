import {
  findStudentCredential,
  putStudentCredential,
  verifyPassword,
  normalizeLoginId
} from '../_shared/credential-store.js';
import { signStudentSession } from '../_shared/student-session.js';

const DATABASE_URL='https://youteach-d9a79-default-rtdb.firebaseio.com';
const SESSION_TTL_MS=12*60*60*1000;

function json(status,payload){
  return new Response(JSON.stringify(payload),{
    status,
    headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}
  });
}
async function firebaseGet(path){
  const response=await fetch(`${DATABASE_URL}/${path}.json`);
  if(!response.ok)throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}
async function firebasePatch(path,value){
  const response=await fetch(`${DATABASE_URL}/${path}.json`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(value||{})
  });
  if(!response.ok)throw new Error(`Firebase write failed: ${response.status}`);
}
function nonce(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function publicStudent(student={}){
  const fullName=String(student.fullName||student.name||'').trim();
  return {
    fullName,
    name:fullName,
    nickname:String(student.nickname||(fullName?fullName.split(/\s+/)[0]:'Student')).trim(),
    groupName:String(student.groupName||'GENERAL'),
    studentNumber:String(student.studentNumber||''),
    id:String(student.id||'')
  };
}
function canonicalExternalId(student,fallback=''){
  return String(student?.studentNumber||student?.id||fallback).trim();
}
async function findLegacyStudent(externalId){
  const students=(await firebaseGet('students'))||{};
  const target=normalizeLoginId(externalId);
  for(const [studentKey,student] of Object.entries(students)){
    const a=normalizeLoginId(student?.studentNumber);
    const b=normalizeLoginId(student?.id);
    if(target&&(target===a||target===b))return {studentKey,student:student||{}};
  }
  return null;
}

export async function onRequestPost({request,env}){
  try{
    let body={};
    try{body=await request.json();}catch{}
    const externalId=String(body.externalId||'').trim();
    const password=String(body.password||'');
    if(!externalId||!password)return json(400,{ok:false,error:'Enter your ID and password.'});
    if(!env.YOUTEACH_AUTH)return json(503,{ok:false,error:'Authentication storage is not configured.'});

    let stored=await findStudentCredential(env.YOUTEACH_AUTH,externalId);
    let studentKey='';
    let student=null;

    if(stored){
      if(!await verifyPassword(password,stored.credential)){
        return json(403,{ok:false,error:'Incorrect ID or password.'});
      }
      studentKey=String(stored.studentKey||'');
      student=await firebaseGet(`students/${encodeURIComponent(studentKey)}`);
      if(!student)return json(403,{ok:false,error:'Incorrect ID or password.'});
    }else{
      const legacy=await findLegacyStudent(externalId);
      if(!legacy)return json(403,{ok:false,error:'Incorrect ID or password.'});
      const legacyPassword=String(
        legacy.student?.password ??
        env.YOUTEACH_DEFAULT_STUDENT_PASSWORD ??
        ''
      );
      if(!legacyPassword||password!==legacyPassword){
        return json(403,{ok:false,error:'Incorrect ID or password.'});
      }
      studentKey=legacy.studentKey;
      student=legacy.student;
      const loginId=canonicalExternalId(student,externalId);
      stored=await putStudentCredential(env.YOUTEACH_AUTH,{
        studentKey,
        externalId:loginId,
        password
      });
      await firebasePatch(`students/${encodeURIComponent(studentKey)}`,{password:null});
    }

    const now=Date.now();
    const expiresAt=now+SESSION_TTL_MS;
    const loginId=canonicalExternalId(student,stored.externalId||externalId);
    const sessionToken=await signStudentSession({
      studentKey,
      externalId:loginId,
      credentialRevision:Number(stored.revision||0),
      iat:now,
      exp:expiresAt,
      nonce:nonce()
    },env.YOUTEACH_SESSION_SECRET);

    return json(200,{
      ok:true,
      studentKey,
      externalId:loginId,
      expiresAt,
      sessionToken,
      student:publicStudent(student)
    });
  }catch(error){
    console.error('Student session failed:',error?.message||error);
    return json(error?.code==='AUTH_STORE_NOT_CONFIGURED'?503:500,{
      ok:false,error:'Could not create the student session.'
    });
  }
}