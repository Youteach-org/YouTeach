import test from "node:test";
import assert from "node:assert/strict";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as registerLiveSession } from "../functions/api/cog-live-session-register.js";
import { onRequestPost as endLiveSession } from "../functions/api/cog-live-session-end.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function teacherBridgeToken(overrides = {}) {
  const now = Date.now();
  return signCogLiveToken({
    purpose: "cog-live-teacher-session",
    teacherUsername: "teacher",
    teacherRole: "teacher",
    teacherDisplayName: "Teacher",
    youTeachSessionId: "yt-123",
    groupName: "533-2",
    assignmentId: "assignment-1",
    recipientStudentKeys: ["student-1", "student-2"],
    recipientTeamLabels: ["Team 1"],
    recipientTeamTarget: "Team 1",
    iat: now,
    exp: now + 60_000,
    ...overrides
  }, SECRET);
}

test("register rejects untrusted COG origins", async () => {
  const response = await registerLiveSession({
    request: new Request("https://youteach.pages.dev/api/cog-live-session-register", {
      method: "POST",
      headers: { Origin: "https://evil.example" }
    }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });
  assert.equal(response.status, 403);
});

test("register creates connectedGame only from canonical active Buzzer session", async () => {
  const token = await teacherBridgeToken();
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify({
        active: true,
        sessionId: "yt-123",
        createdAt: 123,
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PUT") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await registerLiveSession({
      request: new Request("https://youteach.pages.dev/api/cog-live-session-register", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          gameId: "verb-runner",
          gameName: "Verb Runner",
          cogSessionId: "ABC123",
          groupName: "ATTACKER-CONTROLLED"
        })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.connectedGame.groupName, "533-2");
    assert.equal(payload.connectedGame.cogSessionId, "ABC123");
    assert.equal(payload.connectedGame.status, "active");
    assert.equal(payload.connectedGame.launchMode, "live-buzzer");
    assert.equal(payload.connectedGame.assignmentId, "assignment-1");
    assert.deepEqual(payload.connectedGame.recipientStudentKeys, ["student-1", "student-2"]);
    assert.equal(payload.connectedGame.recipientTeamTarget, "Team 1");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].groupName, "533-2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("register rejects a bridge whose YouTeach session no longer matches", async () => {
  const token = await teacherBridgeToken();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    active: true,
    sessionId: "yt-other",
    groupName: "533-2"
  }), { status: 200 });
  try {
    const response = await registerLiveSession({
      request: new Request("https://youteach.pages.dev/api/cog-live-session-register", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ gameId: "verb-runner", gameName: "Verb Runner", cogSessionId: "ABC123" })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explicit end marks the matching connected game ended", async () => {
  const token = await teacherBridgeToken();
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify({
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
          startedAt: 1,
          updatedAt: 1,
          teacherPresenceAt: 1,
          noPresenceSince: null
        }
      }), { status: 200 });
    }
    if (value.endsWith("/session/current/connectedGame.json") && init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };
  try {
    const response = await endLiveSession({
      request: new Request("https://youteach.pages.dev/api/cog-live-session-end", {
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
    assert.equal(writes[0].status, "ended");
    assert.ok(Number.isFinite(writes[0].endedAt));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
