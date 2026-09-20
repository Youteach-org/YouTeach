import { findTeacherCredential, verifyPassword } from '../_shared/credential-store.js';
import { signTeacherSession } from '../_shared/teacher-session.js';

const SESSION_TTL_MS=12*60*60*1000;

function json(status,payload){
  return new Response(JSON.stringify(payload),{
    status,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}
  });
}
function nonce(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequestPost({request,env}){
  try{
    if(!env.YOUTEACH_AUTH)return json(503,{ok:false,error:'Authentication storage is not configured.'});
    let body={};
    try{body=await request.json();}catch{}
    const username=String(body.username||'').trim();
    const password=String(body.password||'');
    if(!username||!password)return json(400,{ok:false,error:'Enter username and password.'});

    const teacher=await findTeacherCredential(env.YOUTEACH_AUTH,username);
    if(!teacher||!await verifyPassword(password,teacher.credential)){
      return json(403,{ok:false,error:'Invalid username or password.'});
    }

    const now=Date.now();
    const expiresAt=now+SESSION_TTL_MS;
    const sessionToken=await signTeacherSession({
      username:teacher.username,
      role:teacher.role,
      displayName:teacher.displayName,
      credentialRevision:Number(teacher.revision||0),
      iat:now,
      exp:expiresAt,
      nonce:nonce()
    },env.YOUTEACH_SESSION_SECRET);

    return json(200,{
      ok:true,
      username:teacher.username,
      role:teacher.role,
      displayName:teacher.displayName,
      expiresAt,
      sessionToken
    });
  }catch(error){
    console.error('Teacher session failed:',error?.message||error);
    return json(500,{ok:false,error:'Could not create the teacher session.'});
  }
}
