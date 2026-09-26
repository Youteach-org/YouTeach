import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_COG_GAMES,
  cogOriginForRequest,
  allowedCogOrigin
} from "../functions/_shared/cog-live-http.js";

test("Talk Talk is a supported Live COG game with direct teacher route", () => {
  assert.deepEqual(LIVE_COG_GAMES["talk-talk"], {
    id:"talk-talk",
    name:"Talk Talk",
    studentPath:"/Talk-Talk/",
    teacherPath:"/Talk-Talk/teacher.html"
  });
});

test("production Live COG points to utichgion.org", () => {
  assert.equal(
    cogOriginForRequest(new Request("https://youteach.pages.dev/api/cog-live-teacher-launch")),
    "https://utichgion.org"
  );
  assert.equal(
    allowedCogOrigin(new Request("https://youteach.pages.dev/api/x",{headers:{Origin:"https://utichgion.org"}})),
    "https://utichgion.org"
  );
});


test("teacher launch opens Talk Talk monitor directly for a Talk Talk COG assignment", async () => {
  const { onRequestPost } = await import("../functions/api/cog-live-teacher-launch.js?t="+Date.now());
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url)=>{
    const value=String(url);
    if(value.endsWith("/session/current.json")){
      return new Response(JSON.stringify({
        active:true,
        sessionId:"yt-talk",
        createdAt:24680,
        groupName:"FANTASMA"
      }),{status:200});
    }
    if(value.endsWith("/assignments/talk-assignment.json")){
      return new Response(JSON.stringify({
        active:true,
        assignmentTypeCode:"COG",
        cogGameId:"talk-talk",
        title:"Talk Talk · Tell Me What Happened",
        groupName:"FANTASMA",
        recipientMode:"generated-teams",
        recipientStudentKeys:["ghost-1","ghost-2"],
        sourceBuzzerSessionCreatedAt:24680
      }),{status:200});
    }
    throw new Error("Unexpected fetch: "+value);
  };

  try{
    const response=await onRequestPost({
      request:new Request("https://youteach.pages.dev/api/cog-live-teacher-launch",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({assignmentId:"talk-assignment"})
      }),
      env:{YOUTEACH_SESSION_SECRET:"test-session-secret-abcdefghijklmnopqrstuvwxyz-123456"}
    });
    assert.equal(response.status,200);
    const payload=await response.json();
    const url=new URL(payload.launchUrl);
    assert.equal(url.origin,"https://utichgion.org");
    assert.equal(url.pathname,"/Talk-Talk/teacher.html");
    assert.ok(url.searchParams.get("ytLiveTeacher"));
  } finally {
    globalThis.fetch=originalFetch;
  }
});


test("Talk Talk student resolve returns canonical team context", async () => {
  const { signCogLiveToken }=await import("../functions/_shared/cog-live-token.js?t="+Date.now());
  const { onRequestPost }=await import("../functions/api/cog-live-student-resolve.js?t="+Date.now());
  const secret="test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";
  const now=Date.now();
  const launch=await signCogLiveToken({
    purpose:"cog-live-student",
    studentKey:"ghost-1",
    externalId:"GHOST01",
    groupName:"FANTASMA",
    youTeachSessionId:"yt-talk",
    assignmentId:"talk-assignment",
    gameId:"talk-talk",
    gameName:"Talk Talk",
    cogSessionId:"TT123",
    iat:now,
    exp:now+60_000,
    nonce:"launch"
  },secret);

  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url)=>{
    const value=String(url);
    if(value.endsWith("/students/ghost-1.json")){
      return new Response(JSON.stringify({
        fullName:"Ghost 1",nickname:"FAKE-01",studentNumber:"GHOST01",
        groupName:"FANTASMA",groupMemberships:{FANTASMA:true}
      }),{status:200});
    }
    if(value.endsWith("/session/current.json")){
      return new Response(JSON.stringify({
        active:true,sessionId:"yt-talk",groupName:"FANTASMA",
        teams:{team1:["FAKE-01","FAKE-02"]},
        assignments:{"ghost-1":"Team 1","ghost-2":"Team 1"},
        connectedGame:{
          gameId:"talk-talk",gameName:"Talk Talk",cogSessionId:"TT123",
          assignmentId:"talk-assignment",groupName:"FANTASMA",
          status:"active",launchMode:"live-buzzer",
          recipientStudentKeys:["ghost-1","ghost-2"]
        }
      }),{status:200});
    }
    throw new Error("Unexpected fetch: "+value);
  };

  try{
    const response=await onRequestPost({
      request:new Request("https://youteach.pages.dev/api/cog-live-student-resolve",{
        method:"POST",
        headers:{Origin:"https://utichgion.org","Content-Type":"application/json"},
        body:JSON.stringify({token:launch})
      }),
      env:{YOUTEACH_SESSION_SECRET:secret}
    });
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.teamContext.teamKey,"team1");
    assert.equal(payload.teamContext.teamLabel,"Team 1");
    assert.deepEqual(payload.teamContext.memberKeys,["ghost-1","ghost-2"]);
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test("Talk Talk result sanitizer rejects raw transcript fields", async () => {
  const source=await readFile(new URL("../functions/api/cog-live-result-submit.js",import.meta.url),"utf8");
  assert.match(source,/cleanTalkTalkMetrics/);
  assert.match(source,/rawTranscript/);
  assert.match(source,/gameId/);
});
