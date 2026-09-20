import {
  officialCogResultsEnabled,
  evaluateOfficialCogAttempt,
  receiptExpiresAt
} from "../../cog-official-result-policy.mjs";
import { verifyCogResultToken } from "../_shared/cog-result-token.js";
import {
  getCurrentCogResult,
  saveOfficialCogResult
} from "../_shared/cog-result-store.js";

const DATABASE_URL="https://youteach-d9a79-default-rtdb.firebaseio.com";

function allowedCogOrigin(request){
  const raw=String(request.headers.get("Origin")||"").trim();
  if(!raw)return "";
  try{
    const url=new URL(raw);
    const host=url.hostname.toLowerCase();
    if(
      url.protocol==="https:" &&
      (host==="classroom-online-games.pages.dev"||host.endsWith(".classroom-online-games.pages.dev"))
    )return url.origin;
  }catch{}
  return null;
}
function corsHeaders(origin){
  const headers={
    "Content-Type":"application/json; charset=UTF-8",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
  if(origin)headers["Access-Control-Allow-Origin"]=origin;
  return headers;
}
function json(status,payload,origin=""){
  return new Response(JSON.stringify(payload),{status,headers:corsHeaders(origin)});
}
async function firebaseGet(path){
  const response=await fetch(`${DATABASE_URL}/${path}.json`);
  if(!response.ok)throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}
async function firebasePatch(path,value){
  const response=await fetch(`${DATABASE_URL}/${path}.json`,{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(value||{})
  });
  if(!response.ok)throw new Error(`Firebase write failed: ${response.status}`);
}
function makeReceiptId(){
  const bytes=crypto.getRandomValues(new Uint8Array(18));
  return "cog-"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
function canonicalConfig(assignment){
  const config=assignment?.cogActivity||{};
  return {
    gameId:String(config.gameId||""),
    modeId:String(config.modeId||""),
    difficultyId:String(config.difficultyId||""),
    minimumPercent:config.minimumPercent==null||config.minimumPercent===""?null:Number(config.minimumPercent),
    pointValue:Number(assignment?.pointValue??config.pointValue??0),
    contractVersion:Number(config.contractVersion||1)
  };
}
function sameConfig(left,right){
  return ["gameId","modeId","difficultyId"].every(key=>String(left?.[key]||"")===String(right?.[key]||"")) &&
    Number(left?.pointValue||0)===Number(right?.pointValue||0) &&
    (left?.minimumPercent==null?null:Number(left.minimumPercent))===(right?.minimumPercent==null?null:Number(right.minimumPercent));
}

export async function onRequestOptions({request}){
  const origin=allowedCogOrigin(request);
  if(origin===null)return new Response(null,{status:403});
  return new Response(null,{
    status:204,
    headers:{
      ...(origin?{"Access-Control-Allow-Origin":origin}:{}),
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Max-Age":"600",
      "Vary":"Origin"
    }
  });
}

export async function onRequestPost({request,env}){
  const origin=allowedCogOrigin(request);
  if(origin===null)return json(403,{ok:false,error:"Official COG submission is only available to Classroom Online Games."});
  try{
    if(!officialCogResultsEnabled(env)){
      return json(503,{ok:false,error:"Official COG submission is not enabled yet."},origin);
    }

    let body={};
    try{body=await request.json();}catch{}
    const submissionToken=String(body.submissionToken||"").trim();
    const attempt=body.attempt||{};
    const grant=await verifyCogResultToken(submissionToken,env.YOUTEACH_SESSION_SECRET);
    if(!grant)return json(401,{ok:false,error:"This result credential expired. Reopen the task from YouTeach."},origin);

    const [student,assignment]=await Promise.all([
      firebaseGet(`students/${encodeURIComponent(grant.studentKey)}`),
      firebaseGet(`assignments/${encodeURIComponent(grant.assignmentId)}`)
    ]);
    if(!student||!assignment)return json(404,{ok:false,error:"Student or assignment not found."},origin);
    if(!assignment.active)return json(403,{ok:false,error:"This assignment is closed."},origin);
    const dueAt=Number(assignment.dueAt||0);
    if(dueAt&&Date.now()>dueAt)return json(403,{ok:false,error:"The due date for this assignment has passed."},origin);
    if(String(assignment.assignmentTypeCode||"").trim().toUpperCase()!=="COG"){
      return json(403,{ok:false,error:"This is no longer a COG assignment."},origin);
    }

    const studentGroup=String(student.groupName||"GENERAL");
    const assignmentGroup=String(assignment.groupName||"ALL");
    if(assignmentGroup!=="ALL"&&assignmentGroup!==studentGroup){
      return json(403,{ok:false,error:"This assignment is no longer assigned to your group."},origin);
    }

    const config=canonicalConfig(assignment);
    if(!sameConfig(config,grant.cogActivity)){
      return json(409,{ok:false,error:"The assigned COG configuration changed. Reopen the task from YouTeach."},origin);
    }

    const evaluated=evaluateOfficialCogAttempt({
      attempt,
      assignmentId:String(grant.assignmentId),
      config
    });
    if(!evaluated.meetsMinimum){
      return json(422,{
        ok:false,
        error:`Minimum performance is ${evaluated.minimumPercent}%. Try the activity again before sending it.`,
        scorePercent:evaluated.scorePercent,
        minimumPercent:evaluated.minimumPercent,
        earnedPoints:evaluated.earnedPoints
      },origin);
    }

    const existing=await getCurrentCogResult(env.YOUTEACH_AUTH,grant.assignmentId,grant.studentKey);
    if(existing&&existing.receiptStatus==="active"&&!existing.withdrawn){
      return json(409,{ok:false,error:"This result is already submitted. Undo Submission in YouTeach before sending a replacement."},origin);
    }

    const now=Date.now();
    const receiptId=makeReceiptId();
    const expiresAt=receiptExpiresAt(now);
    const fullName=String(student.fullName||student.name||"").trim();
    const resubmissionNumber=existing?Math.max(0,Number(existing.resubmissionNumber||0))+1:0;
    const record={
      schemaVersion:1,
      submissionType:"cog",
      submissionStatus:"submitted",
      studentKey:String(grant.studentKey),
      studentName:fullName||String(student.nickname||"Student"),
      nickname:String(student.nickname||""),
      studentNumber:String(student.studentNumber||student.id||""),
      groupName:studentGroup,
      assignmentId:String(grant.assignmentId),
      assignmentCode:String(assignment.code||grant.assignmentCode||""),
      assignmentTitle:String(assignment.title||"COG Activity"),
      cogActivity:config,
      attempt:evaluated,
      officialScorePercent:evaluated.scorePercent,
      earnedPoints:evaluated.earnedPoints,
      pointValue:evaluated.pointValue,
      minimumPercent:evaluated.minimumPercent,
      resubmissionNumber,
      receiptId,
      receiptStatus:"active",
      receiptCreatedAt:now,
      receiptExpiresAt:expiresAt,
      submittedAt:now,
      updatedAt:now,
      withdrawn:false,
      reviewStatus:"official",
      identityReviewStatus:"server-verified"
    };

    await saveOfficialCogResult(env.YOUTEACH_AUTH,record);

    // Firebase is only a display cache. The canonical result and receipt live in private server KV.
    await firebasePatch(
      `assignmentSubmissions/${encodeURIComponent(grant.assignmentId)}/${encodeURIComponent(grant.studentKey)}`,
      {
        submissionType:"cog",
        submissionStatus:"submitted",
        studentKey:record.studentKey,
        studentName:record.studentName,
        nickname:record.nickname,
        studentNumber:record.studentNumber,
        groupName:record.groupName,
        assignmentId:record.assignmentId,
        assignmentCode:record.assignmentCode,
        assignmentTitle:record.assignmentTitle,
        cogActivity:record.cogActivity,
        officialScorePercent:record.officialScorePercent,
        earnedPoints:record.earnedPoints,
        pointValue:record.pointValue,
        minimumPercent:record.minimumPercent,
        resubmissionNumber:record.resubmissionNumber,
        receiptId:record.receiptId,
        receiptStatus:"unverified-cache",
        submittedAt:record.submittedAt,
        updatedAt:record.updatedAt,
        withdrawn:false
      }
    );

    return json(200,{
      ok:true,
      submissionStatus:"submitted",
      officialScorePercent:record.officialScorePercent,
      earnedPoints:record.earnedPoints,
      pointValue:record.pointValue,
      receiptId:record.receiptId,
      receiptStatus:record.receiptStatus,
      receiptExpiresAt:record.receiptExpiresAt,
      resubmissionNumber
    },origin);
  }catch(error){
    console.error("COG result submission failed:",error?.message||error);
    return json(error?.code==="COG_PRIVATE_STORE_NOT_CONFIGURED"?503:400,{
      ok:false,
      error:error?.message||"Could not submit the COG result."
    },origin||"");
  }
}
