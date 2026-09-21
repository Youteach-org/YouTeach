import test from "node:test";
import assert from "node:assert/strict";

import { signStudentSession } from "../functions/_shared/student-session.js";
import { LIVE_COG_IDLE_TTL_MS, LIVE_COG_PRESENCE_STALE_MS } from "../cog-live-session-policy.mjs";
import { onRequestPost as expireLiveGame } from "../functions/api/cog-live-expire.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function studentToken(now = Date.now()) {
  return signStudentSession({
    studentKey: "student-1",
    externalId: "A001",
    credentialRevision: 1,
    iat: now - 1000,
    exp: now + 60_000,
    nonce: "test"
  }, SECRET);
}

function currentSession(overrides = {}) {
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

test("expire endpoint requires a signed YouTeach session", async () => {
  const response = await expireLiveGame({
    request: new Request("https://youteach.pages.dev/api/cog-live-expire", {
      method: "POST"
    }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });
  assert.equal(response.status, 401);
});

test("expire endpoint persists inferred zero-presence start before the 60-minute TTL", async () => {
  const now = Date.now();
  const lastSeen = now - LIVE_COG_PRESENCE_STALE_MS - 10_000;
  const token = await studentToken(now);
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentSession({
        startedAt: lastSeen,
        updatedAt: lastSeen,
        teacherPresenceAt: lastSeen
      })), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await expireLiveGame({
      request: new Request("https://youteach.pages.dev/api/cog-live-expire", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.expired, false);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].noPresenceSince, lastSeen + LIVE_COG_PRESENCE_STALE_MS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expire endpoint marks the live activity expired after 60 continuous minutes with zero presence", async () => {
  const now = Date.now();
  const lastSeen = now - LIVE_COG_PRESENCE_STALE_MS - LIVE_COG_IDLE_TTL_MS - 1_000;
  const token = await studentToken(now);
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentSession({
        startedAt: lastSeen,
        updatedAt: lastSeen,
        teacherPresenceAt: lastSeen
      })), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await expireLiveGame({
      request: new Request("https://youteach.pages.dev/api/cog-live-expire", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.expired, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, "expired");
    assert.ok(Number(writes[0].expiredAt) > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
