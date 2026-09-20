function requireStore(kv){
  if(!kv||typeof kv.get!=='function'||typeof kv.put!=='function'){
    const error=new Error('YOUTEACH_AUTH KV binding is required for official COG results.');
    error.code='COG_PRIVATE_STORE_NOT_CONFIGURED';
    throw error;
  }
  return kv;
}
function currentKey(assignmentId,studentKey){
  return `cog-result:${String(assignmentId)}:${String(studentKey)}`;
}
function receiptKey(receiptId){return `cog-receipt:${String(receiptId)}`;}
function historyKey(assignmentId,studentKey,receiptId){
  return `cog-history:${String(assignmentId)}:${String(studentKey)}:${String(receiptId)}`;
}
async function readJson(kv,key){
  const raw=await requireStore(kv).get(key);
  if(!raw)return null;
  if(typeof raw==='object')return raw;
  try{return JSON.parse(raw);}catch{return null;}
}
async function writeJson(kv,key,value){
  await requireStore(kv).put(key,JSON.stringify(value));
}
export async function getCurrentCogResult(kv,assignmentId,studentKey){
  return readJson(kv,currentKey(assignmentId,studentKey));
}
export async function getCogReceipt(kv,receiptId){
  return readJson(kv,receiptKey(receiptId));
}
export async function saveOfficialCogResult(kv,result){
  const record={...result};
  if(!record.assignmentId||!record.studentKey||!record.receiptId){
    throw new TypeError('Official COG result is missing canonical identifiers.');
  }
  await writeJson(kv,receiptKey(record.receiptId),record);
  await writeJson(kv,currentKey(record.assignmentId,record.studentKey),record);
  return record;
}
export async function invalidateOfficialCogResult(kv,{assignmentId,studentKey,invalidatedAt=Date.now(),reason='undo'}={}){
  const current=await getCurrentCogResult(kv,assignmentId,studentKey);
  if(!current||current.receiptStatus!=='active')return null;
  const invalidated={
    ...current,
    receiptStatus:'invalid',
    invalidatedAt:Number(invalidatedAt),
    invalidationReason:String(reason||'undo'),
    submissionStatus:'awaiting-resubmission',
    withdrawn:true,
    officialScorePercent:null,
    earnedPoints:0,
    updatedAt:Number(invalidatedAt)
  };
  await writeJson(kv,historyKey(assignmentId,studentKey,current.receiptId),current);
  await writeJson(kv,receiptKey(current.receiptId),invalidated);
  await writeJson(kv,currentKey(assignmentId,studentKey),invalidated);
  return invalidated;
}
export async function listAssignmentCogResults(kv,assignmentId){
  requireStore(kv);
  if(typeof kv.list!=='function')throw new Error('Private result storage does not support listing.');
  const prefix=`cog-result:${String(assignmentId)}:`;
  const listed=await kv.list({prefix});
  const results=[];
  for(const item of listed?.keys||[]){
    const value=await readJson(kv,item.name);
    if(value)results.push(value);
  }
  return results;
}
