import test from "node:test";
import assert from "node:assert/strict";

import { signStudentSession } from "../functions/_shared/student-session.js";
import { verifyCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as createStudentLaunch } from "../functions/api/cog-live-student-launch.js";
import { onRequestPost as resolveStudentLaunch } from "../functions/api/cog-live-student-resolve.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function studentSession(now = Date.now()) {
  return signStudentSession({
    studentKey: "student-1",
    externalId: "A001",
    credentialRevision: 1,
    iat: now,
    exp: now + 60 * 60 * 1000,
    nonce: "student-nonce"
  }, SECRET);
}

function connectedGame(overrides = {}) {
  const now = Date.now();
  return {
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "ABC123",
    groupName: "533-2",
    status: "active",
    launchMode: "live-buzzer",
    youTeachSessionId: "yt-123",
    startedAt: now - 1000,
    updatedAt: now - 1000,
    teacherPresenceAt: now - 1000,
    noPresenceSince: null,
    ...overrides
  };
}

test("student launch rejects missing signed session", async () => {
  const response = await createStudentLaunch({
    request: new Request("https://youteach.pages.dev/api/cog-live-student-launch", { method: "POST" }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });
  assert.equal(response.status, 401);
});

test("student launch uses canonical student group and active connected game", async () => {
  const now = Date.now();
  const token = await studentSession(now);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/students/student-1.json")) {
      return new Response(JSON.stringify({
        fullName: "Student One",
        nickname: "Student",
        studentNumber: "A001",
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        groupName: "533-2",
        connectedGame: connectedGame()
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await createStudentLaunch({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-student-launch", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const url = new URL(payload.launchUrl);
    assert.equal(url.origin, "https://classroom-online-games.pages.dev");
    assert.equal(url.pathname, "/Verb-Runner/");
    assert.equal(url.searchParams.get("issuer"), "https://preview.youteach.pages.dev");

    const launch = await verifyCogLiveToken(url.searchParams.get("ytLiveStudent"), SECRET, now + 1000);
    assert.equal(launch?.purpose, "cog-live-student");
    assert.equal(launch?.studentKey, "student-1");
    assert.equal(launch?.groupName, "533-2");
    assert.equal(launch?.cogSessionId, "ABC123");
    assert.equal(launch?.gameId, "verb-runner");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("student in another group cannot launch the connected game", async () => {
  const token = await studentSession();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/students/student-1.json")) {
      return new Response(JSON.stringify({
        studentNumber: "A001",
        groupName: "OTHER"
      }), { status: 200 });
    }
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        groupName: "533-2",
        connectedGame: connectedGame()
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };
  try {
    const response = await createStudentLaunch({
      request: new Request("https://youteach.pages.dev/api/cog-live-student-launch", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("student outside exact COG assignment recipients cannot launch", async () => {
  const token = await studentSession();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/students/student-1.json")) {
      return new Response(JSON.stringify({
        studentNumber: "A001",
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        groupName: "533-2",
        connectedGame: connectedGame({
          assignmentId: "assignment-1",
          recipientStudentKeys: ["student-2"]
        })
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };
  try {
    const response = await createStudentLaunch({
      request: new Request("https://youteach.pages.dev/api/cog-live-student-launch", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("student resolver revalidates the same live session and returns canonical identity", async () => {
  const now = Date.now();
  const launchToken = await (async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const value = String(url);
      if (value.endsWith("/students/student-1.json")) {
        return new Response(JSON.stringify({
          fullName: "Student One",
          nickname: "Student",
          studentNumber: "A001",
          groupName: "533-2"
        }), { status: 200 });
      }
      if (value.endsWith("/session/current.json")) {
        return new Response(JSON.stringify({
          active: true,
          sessionId: "yt-123",
          groupName: "533-2",
          connectedGame: connectedGame()
        }), { status: 200 });
      }
      throw new Error("Unexpected fetch: " + value);
    };
    try {
      const response = await createStudentLaunch({
        request: new Request("https://youteach.pages.dev/api/cog-live-student-launch", {
          method: "POST",
          headers: { Authorization: "Bearer " + await studentSession(now) }
        }),
        env: { YOUTEACH_SESSION_SECRET: SECRET }
      });
      const payload = await response.json();
      return new URL(payload.launchUrl).searchParams.get("ytLiveStudent");
    } finally {
      globalThis.fetch = originalFetch;
    }
  })();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/students/student-1.json")) {
      return new Response(JSON.stringify({
        fullName: "Student One",
        nickname: "Student",
        studentNumber: "A001",
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        groupName: "533-2",
        connectedGame: connectedGame()
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await resolveStudentLaunch({
      request: new Request("https://youteach.pages.dev/api/cog-live-student-resolve", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token: launchToken })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.identity.studentKey, "student-1");
    assert.equal(payload.identity.nickname, "Student");
    assert.equal(payload.liveContext.cogSessionId, "ABC123");
    assert.equal(payload.liveContext.gameId, "verb-runner");
    assert.ok(payload.bridgeToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
