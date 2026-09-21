import test from "node:test";
import assert from "node:assert/strict";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as submitResult } from "../functions/api/cog-live-result-submit.js";

const SECRET="test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";
const NOW=Date.now();

async function token(overrides={}) {
  return signCogLiveToken({
    purpose:"cog-live-student-session",
    studentKey:"student-1",
    externalId:"A001",
    groupName:"533-2",
    youTeachSessionId:"yt-talk-1",
    assignmentId:"assignment-talk-1",
    gameId:"talk-talk",
    cogSessionId:"TT123",
    iat:NOW-1000,
    exp:NOW+60_000,
    ...overrides
  },SECRET);
}

function session(overrides={}) {
  return {
    active:true,
    sessionId:"yt-talk-1",
    groupName:"533-2",
    connectedGame:{
      gameId:"talk-talk",
      gameName:"Talk Talk",
      cogSessionId:"TT123",
      groupName:"533-2",
      assignmentId:"assignment-talk-1",
      recipientStudentKeys:["student-1"],
      status:"active",
      launchMode:"live-buzzer",
      startedAt:NOW-10_000,
      updatedAt:NOW,
      teacherPresenceAt:NOW,
      studentPresence:{"student-1":NOW},
      noPresenceSince:null,
      ...(overrides.connectedGame||{})
    },
    ...overrides,
    connectedGame:{
      gameId:"talk-talk",
      gameName:"Talk Talk",
      cogSessionId:"TT123",
      groupName:"533-2",
      assignmentId:"assignment-talk-1",
      recipientStudentKeys:["student-1"],
      status:"active",
      launchMode:"live-buzzer",
      startedAt:NOW-10_000,
      updatedAt:NOW,
      teacherPresenceAt:NOW,
      studentPresence:{"student-1":NOW},
      noPresenceSince:null,
      ...(overrides.connectedGame||{})
    }
  };
}

function result(overrides={}) {
  return {
    schemaVersion:1,
    resultId:"tt_TT123_student1_attempt1",
    attemptId:"attempt1",
    resultType:"individual",
    completedAt:NOW,
    percentage:82,
    points:null,
    metrics:{
      pronunciation:84,
      fluency:79,
      grammarVocabulary:81,
      interaction:86,
      taskCompletion:90,
      evidenceConfidence:88,
      unitId:"tell-me-what-happened",
      cefr:"B1",
      primaryFocus:"past-ed-t"
    },
    ...overrides
  };
}

function requestFor(bridgeToken,payload) {
  return new Request("https://youteach.pages.dev/api/cog-live-result-submit",{
    method:"POST",
    headers:{
      Origin:"https://utichgion.org",
      Authorization:"Bearer "+bridgeToken,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({result:payload})
  });
}

test("Talk Talk rejects unknown metric keys before Firebase writes", async () => {
  const bridge=await token();
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async () => { calls+=1; throw new Error("Firebase must not be reached"); };
  try {
    const response=await submitResult({
      request:requestFor(bridge,result({
        metrics:{...result().metrics,rawTranscript:"must-not-store"}
      })),
      env:{YOUTEACH_SESSION_SECRET:SECRET}
    });
    assert.equal(response.status,400);
    assert.equal(calls,0);
  } finally { globalThis.fetch=originalFetch; }
});

test("Talk Talk rejects forged session context", async () => {
  const bridge=await token();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url) => {
    if(String(url).endsWith("/session/current.json")){
      return new Response(JSON.stringify(session({connectedGame:{cogSessionId:"OTHER"}})),{status:200});
    }
    throw new Error("Unexpected fetch: "+url);
  };
  try {
    const response=await submitResult({
      request:requestFor(bridge,result()),
      env:{YOUTEACH_SESSION_SECRET:SECRET}
    });
    assert.equal(response.status,409);
  } finally { globalThis.fetch=originalFetch; }
});

test("Talk Talk stores only whitelisted individual metrics", async () => {
  const bridge=await token();
  const writes=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,init={}) => {
    const value=String(url);
    if(value.endsWith("/session/current.json") && (!init.method || init.method==="GET")){
      return new Response(JSON.stringify(session()),{status:200});
    }
    if(value.includes("/classroomGameResults/TT123/student-1/tt_TT123_student1_attempt1.json")){
      if(!init.method || init.method==="GET"){
        return new Response("null",{status:200,headers:{ETag:'"null-etag"'}});
      }
      if(init.method==="PUT"){
        writes.push(JSON.parse(init.body));
        return new Response(init.body,{status:200});
      }
    }
    if(value.includes("/classroomGameResultsByAssignment/") && init.method==="PUT"){
      return new Response(init.body||"{}",{status:200});
    }
    throw new Error("Unexpected fetch: "+value+" "+(init.method||"GET"));
  };
  try {
    const response=await submitResult({
      request:requestFor(bridge,result()),
      env:{YOUTEACH_SESSION_SECRET:SECRET}
    });
    assert.equal(response.status,200);
    assert.equal(writes.length,1);
    assert.equal(writes[0].resultType,"individual");
    assert.deepEqual(writes[0].metrics,result().metrics);
  } finally { globalThis.fetch=originalFetch; }
});

test("Talk Talk duplicate result id returns existing canonical receipt", async () => {
  const bridge=await token();
  const existing={
    ...result(),
    studentKey:"student-1",
    assignmentId:"assignment-talk-1",
    gameId:"talk-talk",
    cogSessionId:"TT123",
    youTeachSessionId:"yt-talk-1",
    acceptedAt:NOW-1000
  };
  let resultPuts=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,init={}) => {
    const value=String(url);
    if(value.endsWith("/session/current.json") && (!init.method || init.method==="GET")){
      return new Response(JSON.stringify(session()),{status:200});
    }
    if(value.includes("/classroomGameResults/TT123/student-1/tt_TT123_student1_attempt1.json")){
      if(!init.method || init.method==="GET"){
        return new Response(JSON.stringify(existing),{status:200,headers:{ETag:'"existing"'}});
      }
      if(init.method==="PUT"){ resultPuts+=1; return new Response("{}",{status:200}); }
    }
    if(value.includes("/classroomGameResultsByAssignment/") && init.method==="PUT"){
      return new Response(init.body||"{}",{status:200});
    }
    throw new Error("Unexpected fetch: "+value+" "+(init.method||"GET"));
  };
  try {
    const response=await submitResult({
      request:requestFor(bridge,result()),
      env:{YOUTEACH_SESSION_SECRET:SECRET}
    });
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.duplicate,true);
    assert.equal(resultPuts,0);
  } finally { globalThis.fetch=originalFetch; }
});
