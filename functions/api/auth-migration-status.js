import { getStudentCredentialByKey } from '../_shared/credential-store.js';

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
function constantTimeEqual(a,b){
  const left=new TextEncoder().encode(String(a||''));
  const right=new TextEncoder().encode(String(b||''));
  if(left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
}
async function firebaseGet(path){
  const response=await fetch(`${DATABASE_URL}/${path}.json`);
  if(!response.ok)throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

export async function onRequestGet({request,env}){
  try{
    if(!env.YOUTEACH_AUTH)return json(503,{ok:false,error:'Authentication storage is not configured.'});
    if(!env.YOUTEACH_AUTH_BOOTSTRAP_SECRET||
       !constantTimeEqual(bearer(request),env.YOUTEACH_AUTH_BOOTSTRAP_SECRET)){
      return json(401,{ok:false,error:'Unauthorized.'});
    }

    const students=(await firebaseGet('students'))||{};
    let migrated=0;
    let pending=0;
    let publicCredentialFields=0;

    for(const [studentKey,student] of Object.entries(students)){
      const stored=await getStudentCredentialByKey(env.YOUTEACH_AUTH,studentKey);
      if(stored)migrated++;
      else pending++;
      if(Object.prototype.hasOwnProperty.call(student||{},'password'))publicCredentialFields++;
    }

    return json(200,{
      ok:true,
      total:Object.keys(students).length,
      migrated,
      pending,
      publicCredentialFields,
      readyForCredentialCutover:pending===0&&publicCredentialFields===0
    });
  }catch(error){
    console.error('Authentication migration status failed:',error?.message||error);
    return json(500,{ok:false,error:'Could not inspect authentication migration status.'});
  }
}