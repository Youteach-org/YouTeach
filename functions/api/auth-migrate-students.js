import {
  getStudentCredentialByKey,
  putStudentCredential
} from '../_shared/credential-store.js';

const DATABASE_URL='https://youteach-d9a79-default-rtdb.firebaseio.com';

function json(status,payload){
  return new Response(JSON.stringify(payload),{
    status,
    headers:{
      'Content-Type':'application/json; charset=UTF-8',
      'Cache-Control':'no-store'
    }
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

async function firebasePatch(path,value){
  const response=await fetch(`${DATABASE_URL}/${path}.json`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(value||{})
  });
  if(!response.ok)throw new Error(`Firebase write failed: ${response.status}`);
  return response.json().catch(()=>null);
}

function externalIdFor(student={}){
  return String(student.studentNumber||student.id||'').trim();
}

function legacyPasswordFor(student={},env={}){
  const direct=student?.password;
  if(direct!=null&&String(direct)!=='')return String(direct);
  return String(env.YOUTEACH_DEFAULT_STUDENT_PASSWORD||'');
}

export async function onRequestPost({request,env}){
  try{
    if(!env.YOUTEACH_AUTH){
      return json(503,{ok:false,error:'Authentication storage is not configured.'});
    }
    if(!env.YOUTEACH_AUTH_BOOTSTRAP_SECRET||
       !constantTimeEqual(bearer(request),env.YOUTEACH_AUTH_BOOTSTRAP_SECRET)){
      return json(401,{ok:false,error:'Unauthorized.'});
    }

    let body={};
    try{ body=await request.json(); }catch{}
    const removePublicPasswords=body.removePublicPasswords!==false;

    const students=(await firebaseGet('students'))||{};
    let migrated=0;
    let alreadyMigrated=0;
    let pending=0;
    let clearedPublicCredentialFields=0;
    let publicCredentialFieldsRemaining=0;
    const pendingStudents=[];

    for(const [studentKey,studentValue] of Object.entries(students)){
      const student=studentValue||{};
      const hasPublicPassword=Object.prototype.hasOwnProperty.call(student,'password');
      const existing=await getStudentCredentialByKey(env.YOUTEACH_AUTH,studentKey);

      if(existing){
        alreadyMigrated++;
        if(hasPublicPassword&&removePublicPasswords){
          await firebasePatch(`students/${encodeURIComponent(studentKey)}`,{password:null});
          clearedPublicCredentialFields++;
        }else if(hasPublicPassword){
          publicCredentialFieldsRemaining++;
        }
        continue;
      }

      const externalId=externalIdFor(student);
      const password=legacyPasswordFor(student,env);
      if(!externalId||!password){
        pending++;
        pendingStudents.push({
          studentKey,
          reason:!externalId?'missing-login-id':'missing-password'
        });
        continue;
      }

      await putStudentCredential(env.YOUTEACH_AUTH,{
        studentKey,
        externalId,
        password
      });

      if(hasPublicPassword&&removePublicPasswords){
        await firebasePatch(`students/${encodeURIComponent(studentKey)}`,{password:null});
        clearedPublicCredentialFields++;
      }else if(hasPublicPassword){
        publicCredentialFieldsRemaining++;
      }
      migrated++;
    }

    return json(200,{
      ok:true,
      total:Object.keys(students).length,
      migrated,
      alreadyMigrated,
      pending,
      clearedPublicCredentialFields,
      publicCredentialFieldsRemaining,
      removePublicPasswords,
      readyForCredentialCutover:pending===0&&publicCredentialFieldsRemaining===0,
      pendingStudents
    });
  }catch(error){
    console.error('Bulk student credential migration failed:',error?.message||error);
    return json(error?.code==='AUTH_STORE_NOT_CONFIGURED'?503:500,{
      ok:false,
      error:'Could not migrate student credentials.'
    });
  }
}