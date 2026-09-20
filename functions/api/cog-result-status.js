import { verifyStudentSession } from "../_shared/student-session.js";
import { getCurrentCogResult } from "../_shared/cog-result-store.js";

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

export async function onRequestGet({request,env}){
  try{
    const session=await verifyStudentSession(bearer(request),env.YOUTEACH_SESSION_SECRET);
    if(!session)return json(401,{ok:false,error:"Sign in again."});
    const url=new URL(request.url);
    const assignmentId=String(url.searchParams.get("assignmentId")||"").trim();
    if(!assignmentId)return json(400,{ok:false,error:"Missing assignment."});

    const result=await getCurrentCogResult(env.YOUTEACH_AUTH,assignmentId,session.studentKey);
    if(!result)return json(200,{ok:true,submission:null});
    return json(200,{
      ok:true,
      submission:{
        submissionType:"cog",
        submissionStatus:result.submissionStatus,
        officialScorePercent:result.officialScorePercent,
        earnedPoints:result.earnedPoints,
        pointValue:result.pointValue,
        minimumPercent:result.minimumPercent,
        receiptId:result.receiptId,
        receiptStatus:result.receiptStatus,
        receiptExpiresAt:result.receiptExpiresAt,
        resubmissionNumber:result.resubmissionNumber,
        submittedAt:result.submittedAt,
        updatedAt:result.updatedAt,
        withdrawn:Boolean(result.withdrawn)
      }
    });
  }catch(error){
    console.error("COG result status failed:",error?.message||error);
    return json(error?.code==="COG_PRIVATE_STORE_NOT_CONFIGURED"?503:500,{
      ok:false,error:"Could not load the official COG result."
    });
  }
}
