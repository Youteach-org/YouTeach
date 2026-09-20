import { putTeacherCredential } from '../_shared/credential-store.js';

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

export async function onRequestPost({request,env}){
  try{
    if(!env.YOUTEACH_AUTH)return json(503,{ok:false,error:'Authentication storage is not configured.'});
    if(!env.YOUTEACH_AUTH_BOOTSTRAP_SECRET||
       !constantTimeEqual(bearer(request),env.YOUTEACH_AUTH_BOOTSTRAP_SECRET)){
      return json(401,{ok:false,error:'Unauthorized.'});
    }

    let body={};
    try{body=await request.json();}catch{}
    const teachers=Array.isArray(body.teachers)?body.teachers:[];
    if(!teachers.length)return json(400,{ok:false,error:'No teacher credentials supplied.'});

    const provisioned=[];
    for(const item of teachers){
      const username=String(item?.username||'').trim();
      const password=String(item?.password||'');
      const role=String(item?.role||'teacher');
      if(!username||password.length<8||!['teacher','admin'].includes(role))continue;
      const stored=await putTeacherCredential(env.YOUTEACH_AUTH,{
        username,password,role,displayName:String(item?.displayName||username)
      });
      provisioned.push({username:stored.username,role:stored.role,displayName:stored.displayName});
    }
    return json(200,{ok:true,count:provisioned.length,teachers:provisioned});
  }catch(error){
    console.error('Auth bootstrap failed:',error?.message||error);
    return json(500,{ok:false,error:'Could not provision authentication.'});
  }
}