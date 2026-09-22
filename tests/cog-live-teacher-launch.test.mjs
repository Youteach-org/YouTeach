import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { signTeacherSession } from "../functions/_shared/teacher-session.js";
import { verifyCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as createTeacherLaunch } from "../functions/api/cog-live-teacher-launch.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

test("COG teacher launch originates from Create Assignment, not a permanent Buzzer button", () => {
  const buzzerHtml = readFileSync(join(root, "buzzer.html"), "utf8");
  const moduleJs = readFileSync(join(root, "assignment-create-module.js"), "utf8");

  assert.doesNotMatch(buzzerHtml, /id="openCogTeacherBtn"/);
  assert.match(moduleJs, /getTeacherSessionToken/);
  assert.match(moduleJs, /\/api\/cog-live-teacher-launch/);
  assert.match(moduleJs, /assignmentId:\s*target\.key/);
  assert.match(moduleJs, /typeCode\s*===\s*"COG"/);
});

test("teacher launch rejects missing authentication before Firebase access", async () => {
  const response = await createTeacherLaunch({
    request: new Request("https://youteach.pages.dev/api/cog-live-teacher-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: "assignment-1" })
    }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });
  assert.equal(response.status, 401);
});

test("teacher launch requires a canonical COG assignment for the active Buzzer group", async () => {
  const now = Date.now();
  const teacherSession = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    credentialRevision: 1,
    iat: now,
    exp: now + 60 * 60 * 1000
  }, SECRET);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        createdAt: 123456789,
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/assignments/assignment-1.json")) {
      return new Response(JSON.stringify({
        active: true,
        assignmentTypeCode: "COG",
        title: "Verb practice",
        groupName: "533-2",
        recipientStudentKeys: ["student-1", "student-2"],
        recipientTeamLabels: ["Team 1"],
        recipientTeamTarget: "Team 1"
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await createTeacherLaunch({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-teacher-launch", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + teacherSession,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ assignmentId: "assignment-1" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const url = new URL(payload.launchUrl);
    assert.equal(url.origin, "https://utichgion.org");
    assert.equal(url.pathname, "/teacher/");
    const launch = await verifyCogLiveToken(url.searchParams.get("ytLiveTeacher"), SECRET, now + 1000);
    assert.equal(launch?.purpose, "cog-live-teacher");
    assert.equal(launch?.assignmentId, "assignment-1");
    assert.equal(launch?.groupName, "533-2");
    assert.deepEqual(launch?.recipientStudentKeys, ["student-1", "student-2"]);
    assert.equal(launch?.youTeachSessionId, "yt-123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("teacher launch rejects non-COG or wrong-group assignments", async () => {
  const now = Date.now();
  const teacherSession = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    credentialRevision: 1,
    iat: now,
    exp: now + 60 * 60 * 1000
  }, SECRET);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/assignments/assignment-1.json")) {
      return new Response(JSON.stringify({
        active: true,
        assignmentTypeCode: "HW",
        groupName: "533-2"
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await createTeacherLaunch({
      request: new Request("https://youteach.pages.dev/api/cog-live-teacher-launch", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + teacherSession,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ assignmentId: "assignment-1" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("teacher launch on Talk Talk preview targets matching COG preview", async () => {
  const now = Date.now();
  const teacherSession = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    credentialRevision: 1,
    iat: now,
    exp: now + 60 * 60 * 1000
  }, SECRET);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active:true, sessionId:"yt-preview", groupName:"533-2"
      }), {status:200});
    }
    if (value.endsWith("/assignments/assignment-preview.json")) {
      return new Response(JSON.stringify({
        active:true,
        assignmentTypeCode:"COG",
        title:"Talk Talk",
        groupName:"533-2",
        recipientStudentKeys:["student-1"]
      }), {status:200});
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await createTeacherLaunch({
      request:new Request("https://talk-talk-v1-20260921.youteach.pages.dev/api/cog-live-teacher-launch", {
        method:"POST",
        headers:{
          Authorization:"Bearer "+teacherSession,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({assignmentId:"assignment-preview"})
      }),
      env:{YOUTEACH_SESSION_SECRET:SECRET}
    });
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(
      new URL(payload.launchUrl).origin,
      "https://talk-talk-v1-20260921.classroom-online-games.pages.dev"
    );
  } finally {
    globalThis.fetch=originalFetch;
  }
});
