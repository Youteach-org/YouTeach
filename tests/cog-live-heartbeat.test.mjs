import test from "node:test";
import assert from "node:assert/strict";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { LIVE_COG_IDLE_TTL_MS, LIVE_COG_PRESENCE_STALE_MS } from "../cog-live-session-policy.mjs";
import { onRequestPost as heartbeat } from "../functions/api/cog-live-heartbeat.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function teacherToken(now = Date.now()) {
  return signCogLiveToken({
    purpose: "cog-live-teacher-session",
    teacherUsername: "teacher",
    groupName: "533-2",
    youTeachSessionId: "yt-123",
    assignmentId: "assignment-1",
    iat: now - 1000,
    exp: now + 60_000
  }, SECRET);
}

async function studentToken(now = Date.now()) {
  return signCogLiveToken({
    purpose: "cog-live-student-session",
    studentKey: "student-1",
    externalId: "A001",
    groupName: "533-2",
    youTeachSessionId: "yt-123",
    assignmentId: "assignment-1",
    gameId: "verb-runner",
    cogSessionId: "ABC123",
    iat: now - 1000,
    exp: now + 60_000
  }, SECRET);
}

function currentGame(overrides = {}) {
  const now = Date.now();
  return {
    active: true,
    sessionId: "yt-123",
    groupName: "533-2",
    connectedGame: {
      gameId: "verb-runner",
      gameName: "Verb Runner",
      cogSessionId: "ABC123",
      groupName: "533-2",
      assignmentId: "assignment-1",
      recipientStudentKeys: ["student-1"],
      status: "active",
      launchMode: "live-buzzer",
      startedAt: now - 10_000,
      updatedAt: now - 10_000,
      teacherPresenceAt: now - 10_000,
      studentPresence: {},
      noPresenceSince: null,
      ...overrides
    }
  };
}

test("teacher heartbeat refreshes presence and clears inactivity clock", async () => {
  const token = await teacherToken();
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentGame({ noPresenceSince: Date.now() - 30_000 })), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await heartbeat({
      request: new Request("https://youteach.pages.dev/api/cog-live-heartbeat", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cogSessionId: "ABC123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].noPresenceSince, null);
    assert.ok(Number(writes[0].teacherPresenceAt) > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("student heartbeat records canonical student presence", async () => {
  const token = await studentToken();
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentGame()), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await heartbeat({
      request: new Request("https://youteach.pages.dev/api/cog-live-heartbeat", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cogSessionId: "ABC123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.ok(Number(writes[0]["studentPresence/student-1"]) > 0);
    assert.equal(writes[0].noPresenceSince, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("heartbeat after full zero-presence TTL marks activity expired instead of reviving it", async () => {
  const now = Date.now();
  const lastSeen = now - LIVE_COG_PRESENCE_STALE_MS - LIVE_COG_IDLE_TTL_MS - 5_000;
  const token = await teacherToken(now);
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentGame({
        startedAt: lastSeen,
        updatedAt: lastSeen,
        teacherPresenceAt: lastSeen,
        studentPresence: {},
        noPresenceSince: null
      })), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await heartbeat({
      request: new Request("https://youteach.pages.dev/api/cog-live-heartbeat", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cogSessionId: "ABC123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 410);
    assert.equal(writes[0].status, "expired");
    assert.ok(Number(writes[0].expiredAt) > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
