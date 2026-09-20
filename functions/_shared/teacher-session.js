const encoder=new TextEncoder();

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
async function keyFor(secret){
  const clean=String(secret||'').trim();
  if(clean.length<32)throw new Error('YOUTEACH_SESSION_SECRET must be configured with at least 32 characters.');
  return crypto.subtle.importKey('raw',encoder.encode(clean),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signTeacherSession(payload,secret){
  const body=bytesToBase64Url(encoder.encode(JSON.stringify({...payload,purpose:'teacher-session'})));
  const key=await keyFor(secret);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(`v1.${body}`));
  return `v1.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}
export async function verifyTeacherSession(token,secret,now=Date.now()){
  const parts=String(token||'').split('.');
  if(parts.length!==3||parts[0]!=='v1')return null;
  let payload,signature;
  try{
    payload=JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    signature=base64UrlToBytes(parts[2]);
  }catch{return null;}
  const key=await keyFor(secret);
  if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(`v1.${parts[1]}`)))return null;
  const expiresAt=Number(payload?.exp||0);
  const username=String(payload?.username||'').trim();
  const role=String(payload?.role||'');
  if(payload?.purpose!=='teacher-session'||!username||!['teacher','admin'].includes(role)||expiresAt<=now)return null;
  return {
    username,
    role,
    displayName:String(payload?.displayName||'Teacher'),
    credentialRevision:Number(payload?.credentialRevision||0),
    issuedAt:Number(payload?.iat||0),
    expiresAt
  };
}
