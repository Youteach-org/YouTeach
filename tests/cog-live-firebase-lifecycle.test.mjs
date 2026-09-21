import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function importRequired(path) {
  const full = join(root, path);
  assert.equal(existsSync(full), true, path + " must exist");
  return import(pathToFileURL(full).href + "?t=" + Date.now() + Math.random());
}

function connectedGame(overrides = {}) {
  const now = Date.now();
  return {
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "VR-123",
    assignmentId: "assignment-1",
    assignmentCode: "COG-FAN-210926",
    assignmentTitle: "Verb Runner Live",
    groupName: "FANTASMA",
    recipientStudentKeys: ["ghost-key-1"],
    status: "active",
    launchMode: "live-buzzer",
    youTeachSessionId: "yt-session-1",
    startedAt: now - 10_000,
    updatedAt: now - 10_000,
    teacherPresenceAt: now - 10_000,
    studentPresence: {},
    noPresenceSince: null,
    endedAt: null,
    expiredAt: null,
    ...overrides
  };
}

function currentSession(game = connectedGame()) {
  return {
    active: true,
    sessionId: "yt-session-1",
    createdAt: 123456,
    groupName: "FANTASMA",
    connectedGame: game
  };
}

async function teacherBridge(now = Date.now()) {
  return signCogLiveToken({
    purpose: "cog-live-teacher-session",
    youTeachSessionId: "yt-session-1",
    groupName: "FANTASMA",
    assignmentId: "assignment-1",
    recipientStudentKeys: ["ghost-key-1"],
    iat: now - 1000,
    exp: now + 60_000,
    nonce: "teacher-bridge"
  }, SECRET);
}

async function studentBridge(now = Date.now()) {
  return signCogLiveToken({
    purpose: "cog-live-student-session",
    studentKey: "ghost-key-1",
    externalId: "GHOST01",
    groupName: "FANTASMA",
    youTeachSessionId: "yt-session-1",
    assignmentId: "assignment-1",
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "VR-123",
    iat: now - 1000,
    exp: now + 60_000,
    nonce: "student-bridge"
  }, SECRET);
}

test("presence policy uses 90-second stale threshold and 60-minute zero-presence TTL", async () => {
  const policy = await importRequired("cog-live-session-policy.mjs");
  assert.equal(policy.LIVE_COG_PRESENCE_STALE_MS, 90 * 1000);
  assert.equal(policy.LIVE_COG_IDLE_TTL_MS, 60 * 60 * 1000);
  assert.equal(typeof policy.livePresenceState, "function");

  const now = Date.now();
  const lastSeen = now - policy.LIVE_COG_PRESENCE_STALE_MS - 10_000;
  const stale = connectedGame({
    startedAt: lastSeen,
    updatedAt: lastSeen,
    teacherPresenceAt: lastSeen,
    studentPresence: {}
  });
  const state = policy.livePresenceState({ connectedGame: stale, now });
  assert.equal(state.hasPresence, false);
  assert.equal(state.noPresenceSince, lastSeen + policy.LIVE_COG_PRESENCE_STALE_MS);
  assert.equal(state.expired, false);

  const expired = policy.livePresenceState({
    connectedGame: stale,
    now: state.noPresenceSince + policy.LIVE_COG_IDLE_TTL_MS + 1
  });
  assert.equal(expired.expired, true);

  const returned = policy.livePresenceState({
    connectedGame: {
      ...stale,
      studentPresence: { "ghost-key-1": now - 1000 },
      noPresenceSince: now - 50_000
    },
    now
  });
  assert.equal(returned.hasPresence, true);
  assert.equal(returned.noPresenceSince, null);
  assert.equal(returned.expired, false);
});

test("teacher and student heartbeat update canonical Firebase presence", async () => {
  const { onRequestPost } = await importRequired("functions/api/cog-live-heartbeat.js");
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentSession()), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const teacherResponse = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-heartbeat", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          Authorization: "Bearer " + await teacherBridge(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: "teacher", cogSessionId: "VR-123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(teacherResponse.status, 200);
    assert.equal(writes[0].noPresenceSince, null);
    assert.ok(Number(writes[0].teacherPresenceAt) > 0);

    const studentResponse = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-heartbeat", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          Authorization: "Bearer " + await studentBridge(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: "student", cogSessionId: "VR-123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(studentResponse.status, 200);
    assert.ok(Number(writes[1]["studentPresence/ghost-key-1"]) > 0);
    assert.equal(writes[1].noPresenceSince, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("heartbeat after a full zero-presence TTL expires instead of reviving the game", async () => {
  const policy = await importRequired("cog-live-session-policy.mjs");
  const { onRequestPost } = await importRequired("functions/api/cog-live-heartbeat.js");
  const now = Date.now();
  const lastSeen = now - policy.LIVE_COG_PRESENCE_STALE_MS - policy.LIVE_COG_IDLE_TTL_MS - 5000;
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentSession(connectedGame({
        startedAt: lastSeen,
        updatedAt: lastSeen,
        teacherPresenceAt: lastSeen,
        studentPresence: {},
        noPresenceSince: null
      }))), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };
  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-heartbeat", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          Authorization: "Bearer " + await teacherBridge(now),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: "teacher", cogSessionId: "VR-123" })
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

test("END ACTIVITY marks only the matching active Firebase connectedGame ended", async () => {
  const { onRequestPost } = await importRequired("functions/api/cog-live-session-end.js");
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentSession()), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };
  try {
    const response = await onRequestPost({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-session-end", {
        method: "POST",
        headers: {
          Origin: "https://preview.classroom-online-games.pages.dev",
          Authorization: "Bearer " + await teacherBridge(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cogSessionId: "VR-123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, "ended");
    assert.ok(Number(writes[0].endedAt) > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function resultEnvelope() {
  return {
    schemaVersion: 1,
    resultId: "vr_VR123_ghost01_attempt1",
    attemptId: "attempt1",
    resultType: "individual",
    completedAt: Date.now(),
    percentage: 85,
    points: null,
    metrics: {
      correct: 17,
      grammarErrors: 2,
      obstacleHits: 1,
      bestStreak: 8,
      timeMs: 123000,
      momentum: 91,
      level: 1,
      mode: "verb-hunt",
      difficulty: "medium"
    }
  };
}

test("result receipt is canonical, mirrored by assignment, and retry-idempotent", async () => {
  const { onRequestPost } = await importRequired("functions/api/cog-live-result-submit.js");
  let canonical = null;
  let canonicalPuts = 0;
  const mirrors = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(currentSession()), { status: 200 });
    }
    if (value.includes("/classroomGameResults/VR-123/ghost-key-1/vr_VR123_ghost01_attempt1.json")) {
      if (!init.method || init.method === "GET") {
        return new Response(JSON.stringify(canonical), {
          status: 200,
          headers: { ETag: canonical ? '"existing-etag"' : '"null-etag"' }
        });
      }
      if (init.method === "PUT") {
        canonicalPuts += 1;
        canonical = JSON.parse(init.body);
        return new Response(JSON.stringify(canonical), { status: 200 });
      }
    }
    if (value.includes("/classroomGameResultsByAssignment/assignment-1/ghost-key-1/vr_VR123_ghost01_attempt1.json") && init.method === "PUT") {
      mirrors.push(JSON.parse(init.body));
      return new Response(init.body, { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  const requestFor = async () => new Request("https://preview.youteach.pages.dev/api/cog-live-result-submit", {
    method: "POST",
    headers: {
      Origin: "https://preview.classroom-online-games.pages.dev",
      Authorization: "Bearer " + await studentBridge(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ result: resultEnvelope() })
  });

  try {
    const first = await onRequestPost({
      request: await requestFor(),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(first.status, 200);
    const firstPayload = await first.json();
    assert.equal(firstPayload.duplicate, false);
    assert.equal(canonicalPuts, 1);
    assert.equal(canonical.studentKey, "ghost-key-1");
    assert.equal(canonical.assignmentId, "assignment-1");
    assert.equal(canonical.gameId, "verb-runner");
    assert.equal(canonical.cogSessionId, "VR-123");
    assert.equal(canonical.percentage, 85);
    assert.equal(mirrors.length, 1);

    const retry = await onRequestPost({
      request: await requestFor(),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(retry.status, 200);
    const retryPayload = await retry.json();
    assert.equal(retryPayload.duplicate, true);
    assert.equal(canonicalPuts, 1);
    assert.equal(mirrors.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
