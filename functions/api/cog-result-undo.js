import { verifyStudentSession } from "../_shared/student-session.js";
import { canUndoSubmission } from "../../cog-assignment-policy.mjs";
import {
  getCurrentCogResult,
  invalidateOfficialCogResult
} from "../_shared/cog-result-store.js";

const DATABASE_URL="https://youteach-d9a79-default-rtdb.firebaseio.com";

function json(status,payload){
  return new Response(JSON.stringify(payload),{
    status,
    headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}
  });
}
function bearer(request){
  const raw=String(request.headers.get("Authorization")||"");
  const match=raw.match(/^Bearer\s+(.+)$/i);
  return match?match[1].trim():"";
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

export async function onRequestPost({request,env}){
  try{
    const session=await verifyStudentSession(bearer(request),env.YOUTEACH_SESSION_SECRET);
    if(!session)return json(401,{ok:false,error:"Sign in again."});

    let body={};
    try{body=await request.json();}catch{}
    const assignmentId=String(body.assignmentId||"").trim();
    if(!assignmentId)return json(400,{ok:false,error:"Missing assignment."});

    const [student,assignment,current]=await Promise.all([
      firebaseGet(`students/${encodeURIComponent(session.studentKey)}`),
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`),
      getCurrentCogResult(env.YOUTEACH_AUTH,assignmentId,session.studentKey)
    ]);
    if(!student||!assignment)return json(404,{ok:false,error:"Student or assignment not found."});
    if(!current||current.receiptStatus!=="active"||current.withdrawn){
      return json(409,{ok:false,error:"There is no active COG submission to undo."});
    }

    const expectedExternalId=String(student.studentNumber||student.id||"").trim();
    if(expectedExternalId!==String(session.externalId||"").trim()){
      return json(403,{ok:false,error:"Student identity does not match this session."});
    }

    const dueAt=Number(assignment.dueAt||0);
    const assignmentOpen=Boolean(assignment.active)&&(!dueAt||Date.now()<=dueAt);
    if(!canUndoSubmission({
      assignmentOpen,
      undoEnabled:assignment.undoSubmissionEnabled!==false
    })){
      return json(403,{ok:false,error:"Undo Submission is not available for this assignment."});
    }

    const invalidated=await invalidateOfficialCogResult(env.YOUTEACH_AUTH,{
      assignmentId,
      studentKey:session.studentKey,
      invalidatedAt:Date.now(),
      reason:"student-undo"
    });

    await firebasePatch(
      `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(session.studentKey)}`,
      {
        submissionType:"cog",
        submissionStatus:"awaiting-resubmission",
        officialScorePercent:null,
        earnedPoints:0,
        receiptStatus:"invalid-cache",
        withdrawn:true,
        withdrawnAt:Date.now(),
        updatedAt:Date.now()
      }
    );

    return json(200,{
      ok:true,
      submissionStatus:invalidated?.submissionStatus||"awaiting-resubmission",
      receiptStatus:"invalid"
    });
  }catch(error){
    console.error("COG result undo failed:",error?.message||error);
    return json(error?.code==="COG_PRIVATE_STORE_NOT_CONFIGURED"?503:500,{
      ok:false,error:"Could not undo the COG submission."
    });
  }
}
