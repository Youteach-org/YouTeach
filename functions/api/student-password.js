import {
  findStudentCredential,
  putStudentCredential,
  verifyPassword
} from '../_shared/credential-store.js';
import { verifyStudentSession } from '../_shared/student-session.js';

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
async function firebasePatch(path,value){
  const response=await fetch(`${DATABASE_URL}/${path}.json`,{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(value||{})
  });
  if(!response.ok)throw new Error(`Firebase write failed: ${response.status}`);
}

export async function onRequestPost({request,env}){
  try{
    if(!env.YOUTEACH_AUTH)return json(503,{ok:false,error:'Authentication storage is not configured.'});
    const session=await verifyStudentSession(bearer(request),env.YOUTEACH_SESSION_SECRET);
    if(!session)return json(401,{ok:false,error:'Sign in again.'});

    let body={};
    try{body=await request.json();}catch{}
    const currentPassword=String(body.currentPassword||'');
    const newPassword=String(body.newPassword||'');
    if(newPassword.length<4)return json(400,{ok:false,error:'New password must contain at least 4 characters.'});

    const stored=await findStudentCredential(env.YOUTEACH_AUTH,session.externalId);
    if(!stored||stored.studentKey!==session.studentKey||
       Number(stored.revision||0)!==Number(session.credentialRevision||0)){
      return json(401,{ok:false,error:'Sign in again before changing your password.'});
    }
    if(!await verifyPassword(currentPassword,stored.credential)){
      return json(403,{ok:false,error:'Current password is incorrect.'});
    }

    const rotated=await putStudentCredential(env.YOUTEACH_AUTH,{
      studentKey:session.studentKey,
      externalId:stored.externalId,
      password:newPassword
    });
    await firebasePatch(`students/${encodeURIComponent(session.studentKey)}`,{password:null});

    return json(200,{ok:true,credentialRevision:rotated.revision,reauthenticate:true});
  }catch(error){
    console.error('Student password change failed:',error?.message||error);
    return json(500,{ok:false,error:'Could not change the password.'});
  }
}