import {
  findTeacherCredential,
  putStudentCredential
} from '../_shared/credential-store.js';
import { verifyTeacherSession } from '../_shared/teacher-session.js';

const DATABASE_URL='https://youteach-d9a79-default-rtdb.firebaseio.com';

function json(status,payload){
  return new Response(JSON.stringify(payload),{
    status,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}
  });
}
function bearer(request){
  const value=String(request.headers.get('authorization')||'');
  return /^Bearer\s+/i.test(value)?value.replace(/^Bearer\s+/i,'').trim():'';
}
function firebaseSafeKey(value){
  return String(value||'').replace(/[.#$\[\]\/]/g,'_');
}
async function firebasePut(path,value){
  const response=await fetch(`${DATABASE_URL}/${path}.json`,{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)
  });
  if(!response.ok)throw new Error(`Firebase write failed: ${response.status}`);
}
async function authorizeTeacher(request,env){
  const session=await verifyTeacherSession(bearer(request),env.YOUTEACH_SESSION_SECRET);
  if(!session)return null;
  const stored=await findTeacherCredential(env.YOUTEACH_AUTH,session.username);
  if(!stored||Number(stored.revision||0)!==Number(session.credentialRevision||0))return null;
  return session;
}
function makeInternalId(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID().replace(/-/g,'').slice(0,16);
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequestPost({request,env}){
  try{
    if(!env.YOUTEACH_AUTH)return json(503,{ok:false,error:'Authentication storage is not configured.'});
    const teacher=await authorizeTeacher(request,env);
    if(!teacher)return json(401,{ok:false,error:'Teacher sign-in required.'});

    let body={};
    try{body=await request.json();}catch{}
    const source=Array.isArray(body.students)?body.students:[body.student||body];
    if(!source.length)return json(400,{ok:false,error:'No students supplied.'});

    const defaultPassword=String(env.YOUTEACH_DEFAULT_STUDENT_PASSWORD||'');
    if(!defaultPassword)return json(503,{ok:false,error:'Default student credential is not configured.'});

    const created=[];
    for(const item of source){
      const fullName=String(item?.fullName||item?.name||'').trim();
      const nickname=String(item?.nickname||'').trim()||(fullName?fullName.split(/\s+/)[0]:'Student');
      const groupName=String(item?.groupName||'GENERAL').trim()||'GENERAL';
      const studentNumber=String(item?.studentNumber||item?.externalId||'').trim();
      if(!fullName)continue;

      const internalId=String(item?.id||makeInternalId()).trim();
      const loginId=studentNumber||internalId;
      const studentKey='s-'+firebaseSafeKey(internalId)+'-'+Date.now().toString(36);
      const record={
        fullName,
        name:fullName,
        nickname,
        studentNumber,
        groupName,
        id:internalId,
        activeNow:false,
        blockPoints:{'Block 1':0,'Block 2':0,'Block 3':0},
        createdAt:Date.now(),
        createdBy:teacher.username
      };
      await firebasePut(`students/${encodeURIComponent(studentKey)}`,record);
      await putStudentCredential(env.YOUTEACH_AUTH,{
        studentKey,
        externalId:loginId,
        password:defaultPassword
      });
      created.push({studentKey,externalId:loginId,fullName});
    }

    if(!created.length)return json(400,{ok:false,error:'No valid students supplied.'});
    return json(200,{ok:true,count:created.length,students:created});
  }catch(error){
    console.error('Student enrollment failed:',error?.message||error);
    return json(500,{ok:false,error:'Could not enroll students.'});
  }
}
