import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

async function importFromRoot(path) {
  return import(pathToFileURL(join(root, path)).href + "?t=" + Date.now());
}

function installFirebaseMock(routes) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    for (const [suffix, response] of routes) {
      if (value.endsWith(suffix)) {
        const payload = typeof response === "function" ? await response({ url: value, options }) : response;
        return new Response(JSON.stringify(payload.body), {
          status: payload.status ?? 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    throw new Error("Unexpected fetch: " + value);
  };
  return () => { globalThis.fetch = original; };
}

test("Live COG integration preserves the existing Firebase login architecture", () => {
  const teacherLogin = source("teacher-login.js");
  const teacherAuth = source("teacher-auth.js");
  const studentAuth = source("student-auth.js");

  assert.match(teacherLogin, /from "\.\/firebase\.js"/);
  assert.match(teacherLogin, /const USERS = \[/);
  assert.match(teacherAuth, /youteachTeacherAuth/);
  assert.doesNotMatch(teacherLogin, /\/api\/teacher-session/);
  assert.doesNotMatch(teacherAuth, /youteachTeacherSession/);

  assert.match(studentAuth, /from "\.\/firebase\.js"/);
  assert.match(studentAuth, /get\(ref\(db, "students"\)\)/);
  assert.doesNotMatch(studentAuth, /\/api\/student-session/);
  assert.doesNotMatch(studentAuth, /youteachStudentSessionToken/);
});

test("teacher live launch is signed from canonical Firebase Buzzer session and COG assignment", async () => {
  const endpointPath = "functions/api/cog-live-teacher-launch.js";
  const tokenPath = "functions/_shared/cog-live-token.js";
  assert.equal(existsSync(join(root, endpointPath)), true, endpointPath + " must exist");
  assert.equal(existsSync(join(root, tokenPath)), true, tokenPath + " must exist");

  const endpointSource = source(endpointPath);
  assert.doesNotMatch(endpointSource, /YOUTEACH_AUTH|verifyTeacherSession|teacher-session/);

  const { onRequestPost } = await importFromRoot(endpointPath);
  const { verifyCogLiveToken } = await importFromRoot(tokenPath);

  const restore = installFirebaseMock([
    ["/session/current.json", { body: {
      active: true,
      sessionId: "yt-session-1",
      createdAt: 123456,
      groupName: "FANTASMA"
    }}],
    ["/assignments/cog-assignment-1.json", { body: {
      active: true,
      assignmentTypeCode: "COG",
      title: "Verb Runner Live",
      groupName: "FANTASMA",
      recipientMode: "generated-teams",
      recipientStudentKeys: ["ghost-key-1", "ghost-key-2"],
      sourceBuzzerSessionCreatedAt: 123456
    }}]
  ]);

  try {
    const request = new Request("https://preview.youteach.pages.dev/api/cog-live-teacher-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: "cog-assignment-1" })
    });
    const response = await onRequestPost({
      request,
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    const launchUrl = new URL(payload.launchUrl);
    assert.equal(launchUrl.pathname, "/teacher/");
    assert.equal(launchUrl.searchParams.get("issuer"), "https://preview.youteach.pages.dev");

    const grant = await verifyCogLiveToken(
      launchUrl.searchParams.get("ytLiveTeacher"),
      SECRET,
      Date.now()
    );
    assert.equal(grant?.purpose, "cog-live-teacher");
    assert.equal(grant?.youTeachSessionId, "yt-session-1");
    assert.equal(grant?.groupName, "FANTASMA");
    assert.equal(grant?.assignmentId, "cog-assignment-1");
    assert.deepEqual(grant?.recipientStudentKeys, ["ghost-key-1", "ghost-key-2"]);
  } finally {
    restore();
  }
});

test("teacher live launch rejects a non-COG assignment", async () => {
  const endpointPath = "functions/api/cog-live-teacher-launch.js";
  assert.equal(existsSync(join(root, endpointPath)), true, endpointPath + " must exist");
  const { onRequestPost } = await importFromRoot(endpointPath);

  const restore = installFirebaseMock([
    ["/session/current.json", { body: {
      active: true,
      sessionId: "yt-session-1",
      createdAt: 123456,
      groupName: "FANTASMA"
    }}],
    ["/assignments/not-cog.json", { body: {
      active: true,
      assignmentTypeCode: "HW",
      title: "Homework",
      groupName: "FANTASMA"
    }}]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-teacher-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: "not-cog" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 409);
  } finally {
    restore();
  }
});

test("student live launch validates canonical Firebase student identity and connected-game recipients", async () => {
  const endpointPath = "functions/api/cog-live-student-launch.js";
  const tokenPath = "functions/_shared/cog-live-token.js";
  assert.equal(existsSync(join(root, endpointPath)), true, endpointPath + " must exist");
  assert.equal(existsSync(join(root, tokenPath)), true, tokenPath + " must exist");

  const endpointSource = source(endpointPath);
  assert.doesNotMatch(endpointSource, /YOUTEACH_AUTH|verifyStudentSession|student-session/);

  const { onRequestPost } = await importFromRoot(endpointPath);
  const { verifyCogLiveToken } = await importFromRoot(tokenPath);

  const restore = installFirebaseMock([
    ["/students/ghost-key-1.json", { body: {
      fullName: "Ghost Student 01",
      nickname: "FAKE-01",
      studentNumber: "GHOST01",
      groupName: "FANTASMA"
    }}],
    ["/session/current.json", { body: {
      active: true,
      sessionId: "yt-session-1",
      groupName: "FANTASMA",
      connectedGame: {
        gameId: "verb-runner",
        gameName: "Verb Runner",
        cogSessionId: "COG-123",
        assignmentId: "cog-assignment-1",
        groupName: "FANTASMA",
        status: "active",
        launchMode: "live-buzzer",
        recipientStudentKeys: ["ghost-key-1", "ghost-key-2"],
        startedAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
        teacherPresenceAt: Date.now() - 1000,
        noPresenceSince: null
      }
    }}]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-student-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentKey: "ghost-key-1", externalId: "GHOST01" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    const launchUrl = new URL(payload.launchUrl);
    assert.equal(launchUrl.pathname, "/Verb-Runner/");

    const grant = await verifyCogLiveToken(
      launchUrl.searchParams.get("ytLiveStudent"),
      SECRET,
      Date.now()
    );
    assert.equal(grant?.purpose, "cog-live-student");
    assert.equal(grant?.studentKey, "ghost-key-1");
    assert.equal(grant?.externalId, "GHOST01");
    assert.equal(grant?.nickname, "FAKE-01");
    assert.equal(grant?.groupName, "FANTASMA");
    assert.equal(grant?.gameId, "verb-runner");
    assert.equal(grant?.cogSessionId, "COG-123");
  } finally {
    restore();
  }
});
