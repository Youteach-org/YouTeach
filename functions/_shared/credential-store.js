const encoder=new TextEncoder();
const PASSWORD_ALGORITHM='PBKDF2-SHA256';
const PASSWORD_ITERATIONS=210000;

function bytesToBase64Url(bytes){
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

function base64UrlToBytes(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-(normalized.length%4||4))%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,(char)=>char.charCodeAt(0));
}

function requireKv(kv){
  if(!kv||typeof kv.get!=='function'||typeof kv.put!=='function'){
    const error=new Error('YOUTEACH_AUTH KV binding is not configured.');
    error.code='AUTH_STORE_NOT_CONFIGURED';
    throw error;
  }
  return kv;
}

async function readJson(kv,key){
  const raw=await requireKv(kv).get(key);
  if(!raw)return null;
  if(typeof raw==='object')return raw;
  try{return JSON.parse(raw);}catch{return null;}
}

async function writeJson(kv,key,value){
  await requireKv(kv).put(key,JSON.stringify(value));
}

export function normalizeLoginId(value){
  return String(value||'').trim().toLowerCase();
}

export async function createPasswordRecord(password,{iterations=PASSWORD_ITERATIONS,salt=''}={}){
  const secret=String(password||'');
  if(!secret)throw new TypeError('Password is required.');
  const rounds=Math.max(200000,Number(iterations)||PASSWORD_ITERATIONS);
  const saltBytes=salt?base64UrlToBytes(salt):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits(
    {name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations:rounds},
    key,
    256
  );
  return {
    algorithm:PASSWORD_ALGORITHM,
    version:1,
    iterations:rounds,
    salt:bytesToBase64Url(saltBytes),
    hash:bytesToBase64Url(new Uint8Array(bits))
  };
}

export async function verifyPassword(password,record){
  if(!record||record.algorithm!==PASSWORD_ALGORITHM||Number(record.version)!==1)return false;
  try{
    const derived=await createPasswordRecord(password,{
      iterations:Number(record.iterations),
      salt:String(record.salt||'')
    });
    const left=base64UrlToBytes(derived.hash);
    const right=base64UrlToBytes(record.hash);
    if(left.length!==right.length)return false;
    let diff=0;
    for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
    return diff===0;
  }catch{
    return false;
  }
}

export async function putStudentCredential(kv,{studentKey,externalId,password}={}){
  const cleanKey=String(studentKey||'').trim();
  const cleanId=String(externalId||'').trim();
  const loginId=normalizeLoginId(cleanId);
  if(!cleanKey||!loginId)throw new TypeError('Student key and login ID are required.');

  const existing=await readJson(kv,`student:${cleanKey}`);
  const credential=await createPasswordRecord(password);
  const record={
    studentKey:cleanKey,
    externalId:cleanId,
    normalizedExternalId:loginId,
    revision:Math.max(0,Number(existing?.revision)||0)+1,
    credential,
    updatedAt:Date.now()
  };
  await writeJson(kv,`student:${cleanKey}`,record);
  await writeJson(kv,`student-id:${loginId}`,{studentKey:cleanKey});
  return record;
}

export async function findStudentCredential(kv,externalId){
  const loginId=normalizeLoginId(externalId);
  if(!loginId)return null;
  const index=await readJson(kv,`student-id:${loginId}`);
  const studentKey=String(index?.studentKey||'').trim();
  if(!studentKey)return null;
  return readJson(kv,`student:${studentKey}`);
}

export async function getStudentCredentialByKey(kv,studentKey){
  const clean=String(studentKey||'').trim();
  return clean?readJson(kv,`student:${clean}`):null;
}

export async function putTeacherCredential(kv,{username,password,role='teacher',displayName='Teacher'}={}){
  const cleanUser=normalizeLoginId(username);
  if(!cleanUser)throw new TypeError('Teacher username is required.');
  if(!['teacher','admin'].includes(role))throw new TypeError('Unsupported teacher role.');

  const existing=await readJson(kv,`teacher:${cleanUser}`);
  const credential=await createPasswordRecord(password);
  const record={
    username:cleanUser,
    role,
    displayName:String(displayName||cleanUser).trim()||cleanUser,
    revision:Math.max(0,Number(existing?.revision)||0)+1,
    credential,
    updatedAt:Date.now()
  };
  await writeJson(kv,`teacher:${cleanUser}`,record);
  return record;
}

export async function findTeacherCredential(kv,username){
  const cleanUser=normalizeLoginId(username);
  return cleanUser?readJson(kv,`teacher:${cleanUser}`):null;
}
