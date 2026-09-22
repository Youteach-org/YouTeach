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


test("teacher resolve revalidates Firebase and returns the bridge context COG expects", async () => {
  const endpointPath = "functions/api/cog-live-teacher-resolve.js";
  assert.equal(existsSync(join(root, endpointPath)), true, endpointPath + " must exist");

  const { signCogLiveToken, verifyCogLiveToken } = await importFromRoot("functions/_shared/cog-live-token.js");
  const { onRequestPost } = await importFromRoot(endpointPath);
  const now = Date.now();
  const launchToken = await signCogLiveToken({
    purpose: "cog-live-teacher",
    youTeachSessionId: "yt-session-1",
    groupName: "FANTASMA",
    assignmentId: "cog-assignment-1",
    assignmentCode: "COG-FAN-210926",
    assignmentTitle: "Verb Runner Live",
    recipientStudentKeys: ["ghost-key-1", "ghost-key-2"],
    iat: now,
    exp: now + 60_000,
    nonce: "teacher-launch"
  }, SECRET);

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
      code: "COG-FAN-210926",
      title: "Verb Runner Live",
      createdBy: "Teacher",
      groupName: "FANTASMA",
      recipientStudentKeys: ["ghost-key-1", "ghost-key-2"],
      sourceBuzzerSessionCreatedAt: 123456
    }}]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-teacher-resolve", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token: launchToken })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://preview.classroom-online-games.pages.dev"
    );
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.ok(payload.teacher?.username);
    assert.equal(payload.teacher?.displayName, "Teacher");
    assert.equal(payload.liveContext?.youTeachSessionId, "yt-session-1");
    assert.equal(payload.liveContext?.groupName, "FANTASMA");
    assert.equal(payload.liveContext?.assignmentId, "cog-assignment-1");
    assert.ok(payload.bridgeToken);

    const bridge = await verifyCogLiveToken(
      payload.bridgeToken,
      SECRET,
      now + 1000,
      "cog-live-teacher-session"
    );
    assert.equal(bridge?.assignmentId, "cog-assignment-1");
    assert.deepEqual(bridge?.recipientStudentKeys, ["ghost-key-1", "ghost-key-2"]);
  } finally {
    restore();
  }
});

test("teacher bridge registers a canonical connectedGame under Firebase session/current", async () => {
  const endpointPath = "functions/api/cog-live-session-register.js";
  assert.equal(existsSync(join(root, endpointPath)), true, endpointPath + " must exist");

  const { signCogLiveToken } = await importFromRoot("functions/_shared/cog-live-token.js");
  const { onRequestPost } = await importFromRoot(endpointPath);
  const now = Date.now();
  const bridgeToken = await signCogLiveToken({
    purpose: "cog-live-teacher-session",
    youTeachSessionId: "yt-session-1",
    groupName: "FANTASMA",
    assignmentId: "cog-assignment-1",
    assignmentCode: "COG-FAN-210926",
    assignmentTitle: "Verb Runner Live",
    recipientStudentKeys: ["ghost-key-1", "ghost-key-2"],
    iat: now,
    exp: now + 60_000,
    nonce: "teacher-bridge"
  }, SECRET);

  let written = null;
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
      code: "COG-FAN-210926",
      title: "Verb Runner Live",
      groupName: "FANTASMA",
      recipientStudentKeys: ["ghost-key-1", "ghost-key-2"],
      sourceBuzzerSessionCreatedAt: 123456
    }}],
    ["/session/current/connectedGame.json", async ({ options }) => {
      written = JSON.parse(String(options.body || "null"));
      return { body: written };
    }]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-session-register", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          "Content-Type": "application/json",
          Authorization: "Bearer " + bridgeToken
        },
        body: JSON.stringify({
          gameId: "verb-runner",
          gameName: "Verb Runner",
          cogSessionId: "VR-123"
        })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(written?.gameId, "verb-runner");
    assert.equal(written?.cogSessionId, "VR-123");
    assert.equal(written?.groupName, "FANTASMA");
    assert.equal(written?.assignmentId, "cog-assignment-1");
    assert.equal(written?.launchMode, "live-buzzer");
    assert.equal(written?.status, "active");
    assert.deepEqual(written?.recipientStudentKeys, ["ghost-key-1", "ghost-key-2"]);
  } finally {
    restore();
  }
});

test("student resolve revalidates Firebase identity and returns the COG student bridge context", async () => {
  const endpointPath = "functions/api/cog-live-student-resolve.js";
  assert.equal(existsSync(join(root, endpointPath)), true, endpointPath + " must exist");

  const { signCogLiveToken, verifyCogLiveToken } = await importFromRoot("functions/_shared/cog-live-token.js");
  const { onRequestPost } = await importFromRoot(endpointPath);
  const now = Date.now();
  const launchToken = await signCogLiveToken({
    purpose: "cog-live-student",
    studentKey: "ghost-key-1",
    externalId: "GHOST01",
    fullName: "Ghost Student 01",
    nickname: "FAKE-01",
    groupName: "FANTASMA",
    youTeachSessionId: "yt-session-1",
    assignmentId: "cog-assignment-1",
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "VR-123",
    iat: now,
    exp: now + 60_000,
    nonce: "student-launch"
  }, SECRET);

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
        cogSessionId: "VR-123",
        assignmentId: "cog-assignment-1",
        groupName: "FANTASMA",
        status: "active",
        launchMode: "live-buzzer",
        recipientStudentKeys: ["ghost-key-1", "ghost-key-2"]
      }
    }}]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-student-resolve", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token: launchToken })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://preview.classroom-online-games.pages.dev"
    );
    const payload = await response.json();
    assert.equal(payload.identity?.studentKey, "ghost-key-1");
    assert.equal(payload.identity?.nickname, "FAKE-01");
    assert.equal(payload.liveContext?.gameId, "verb-runner");
    assert.equal(payload.liveContext?.cogSessionId, "VR-123");
    assert.ok(payload.bridgeToken);

    const bridge = await verifyCogLiveToken(
      payload.bridgeToken,
      SECRET,
      now + 1000,
      "cog-live-student-session"
    );
    assert.equal(bridge?.studentKey, "ghost-key-1");
    assert.equal(bridge?.cogSessionId, "VR-123");
  } finally {
    restore();
  }
});


test("student launch accepts secondary group membership and grants the active Buzzer group", async () => {
  const endpointPath = "functions/api/cog-live-student-launch.js";
  const tokenPath = "functions/_shared/cog-live-token.js";
  const { onRequestPost } = await importFromRoot(endpointPath);
  const { verifyCogLiveToken } = await importFromRoot(tokenPath);
  const now = Date.now();

  const restore = installFirebaseMock([
    ["/students/ghost-key-20.json", { body: {
      fullName: "Ghost Student 20",
      nickname: "FAKE-20",
      studentNumber: "GHOST20",
      groupName: "303-2 epidemiologia",
      groupMemberships: { "303-2 epidemiologia": true, FANTASMA: true }
    }}],
    ["/session/current.json", { body: {
      active: true,
      sessionId: "yt-session-multi",
      createdAt: 654321,
      groupName: "FANTASMA",
      connectedGame: {
        gameId: "verb-runner",
        gameName: "Verb Runner",
        cogSessionId: "VR-MULTI",
        assignmentId: "cog-assignment-multi",
        groupName: "FANTASMA",
        status: "active",
        launchMode: "live-buzzer",
        recipientStudentKeys: ["ghost-key-20"],
        startedAt: now - 1000,
        updatedAt: now - 1000,
        teacherPresenceAt: now - 1000,
        noPresenceSince: null
      }
    }}]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-student-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentKey: "ghost-key-20", externalId: "GHOST20" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const launchUrl = new URL(payload.launchUrl);
    const grant = await verifyCogLiveToken(
      launchUrl.searchParams.get("ytLiveStudent"),
      SECRET,
      now + 1000,
      "cog-live-student"
    );
    assert.equal(grant?.groupName, "FANTASMA");
  } finally {
    restore();
  }
});

test("student resolve keeps the active Buzzer group for a multi-group student", async () => {
  const endpointPath = "functions/api/cog-live-student-resolve.js";
  const { onRequestPost } = await importFromRoot(endpointPath);
  const { signCogLiveToken } = await importFromRoot("functions/_shared/cog-live-token.js");
  const now = Date.now();
  const launchToken = await signCogLiveToken({
    purpose: "cog-live-student",
    studentKey: "ghost-key-20",
    externalId: "GHOST20",
    fullName: "Ghost Student 20",
    nickname: "FAKE-20",
    groupName: "FANTASMA",
    youTeachSessionId: "yt-session-multi",
    assignmentId: "cog-assignment-multi",
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "VR-MULTI",
    iat: now,
    exp: now + 60_000,
    nonce: "multi-student-launch"
  }, SECRET);

  const restore = installFirebaseMock([
    ["/students/ghost-key-20.json", { body: {
      fullName: "Ghost Student 20",
      nickname: "FAKE-20",
      studentNumber: "GHOST20",
      groupName: "303-2 epidemiologia",
      groupMemberships: { "303-2 epidemiologia": true, FANTASMA: true }
    }}],
    ["/session/current.json", { body: {
      active: true,
      sessionId: "yt-session-multi",
      groupName: "FANTASMA",
      connectedGame: {
        gameId: "verb-runner",
        gameName: "Verb Runner",
        cogSessionId: "VR-MULTI",
        assignmentId: "cog-assignment-multi",
        groupName: "FANTASMA",
        status: "active",
        launchMode: "live-buzzer",
        recipientStudentKeys: ["ghost-key-20"],
        startedAt: now - 1000,
        updatedAt: now - 1000,
        teacherPresenceAt: now - 1000,
        noPresenceSince: null
      }
    }}]
  ]);

  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-student-resolve", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token: launchToken })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.identity?.groupName, "FANTASMA");
    assert.equal(payload.liveContext?.groupName, "FANTASMA");
  } finally {
    restore();
  }
});
