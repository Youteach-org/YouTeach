import test from "node:test";
import assert from "node:assert/strict";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as submitResult } from "../functions/api/cog-live-result-submit.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function studentBridgeToken() {
  const now = Date.now();
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

function session() {
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
      startedAt: Date.now() - 60_000,
      updatedAt: Date.now(),
      teacherPresenceAt: Date.now(),
      studentPresence: { "student-1": Date.now() },
      noPresenceSince: null
    }
  };
}

function result() {
  return {
    schemaVersion: 1,
    resultId: "vr_ABC123_student1_attempt1",
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

test("live result rejects an invalid bridge before Firebase writes", async () => {
  const response = await submitResult({
    request: new Request("https://youteach.pages.dev/api/cog-live-result-submit", {
      method: "POST",
      headers: {
        Origin: "https://classroom-online-games.pages.dev",
        Authorization: "Bearer invalid",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ result: result() })
    }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });
  assert.equal(response.status, 401);
});

test("live result is stored under canonical session/student identity", async () => {
  const token = await studentBridgeToken();
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(session()), { status: 200 });
    }
    if (value.includes("/classroomGameResults/ABC123/student-1/vr_ABC123_student1_attempt1.json")) {
      if (!init.method || init.method === "GET") {
        return new Response("null", {
          status: 200,
          headers: { ETag: '"null-etag"' }
        });
      }
      if (init.method === "PUT") {
        writes.push({ value, init, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(JSON.parse(init.body)), { status: 200 });
      }
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await submitResult({
      request: new Request("https://youteach.pages.dev/api/cog-live-result-submit", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ result: result() })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.duplicate, false);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.studentKey, "student-1");
    assert.equal(writes[0].body.assignmentId, "assignment-1");
    assert.equal(writes[0].body.gameId, "verb-runner");
    assert.equal(writes[0].body.percentage, 85);
    assert.equal(writes[0].init.headers["if-match"], '"null-etag"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retrying the same result id returns the existing receipt without a second write", async () => {
  const token = await studentBridgeToken();
  const existing = {
    resultId: "vr_ABC123_student1_attempt1",
    studentKey: "student-1",
    assignmentId: "assignment-1",
    gameId: "verb-runner",
    cogSessionId: "ABC123",
    percentage: 85,
    acceptedAt: Date.now() - 1000
  };
  let puts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/session/current.json") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify(session()), { status: 200 });
    }
    if (value.includes("/classroomGameResults/ABC123/student-1/vr_ABC123_student1_attempt1.json")) {
      if (!init.method || init.method === "GET") {
        return new Response(JSON.stringify(existing), {
          status: 200,
          headers: { ETag: '"existing-etag"' }
        });
      }
      if (init.method === "PUT") {
        puts += 1;
        return new Response("{}", { status: 200 });
      }
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await submitResult({
      request: new Request("https://youteach.pages.dev/api/cog-live-result-submit", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ result: result() })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.duplicate, true);
    assert.equal(puts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("result for another game session is rejected", async () => {
  const token = await studentBridgeToken();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        ...session(),
        connectedGame: {
          ...session().connectedGame,
          cogSessionId: "OTHER"
        }
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };
  try {
    const response = await submitResult({
      request: new Request("https://youteach.pages.dev/api/cog-live-result-submit", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ result: result() })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Support Meter metrics are preserved in the canonical live result receipt", async () => {
  const now = Date.now();
  const token = await signCogLiveToken({
    purpose: "cog-live-student-session",
    studentKey: "student-1",
    externalId: "A001",
    groupName: "533-2",
    youTeachSessionId: "yt-123",
    assignmentId: "assignment-1",
    gameId: "support-meter",
    cogSessionId: "SM123",
    iat: now - 1000,
    exp: now + 60_000
  }, SECRET);

  const supportResult = {
    schemaVersion: 1,
    resultId: "sm_SM123_run001",
    attemptId: "run001",
    resultType: "individual",
    completedAt: now,
    percentage: 88,
    points: null,
    metrics: {
      supportMeter: 88,
      streak: 6,
      storiesCompleted: 8,
      translationAttempts: 1,
      mode: "support-meter"
    }
  };

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
          gameId: "support-meter",
          gameName: "Support Meter",
          cogSessionId: "SM123",
          groupName: "533-2",
          assignmentId: "assignment-1",
          recipientStudentKeys: ["student-1"],
          status: "active",
          launchMode: "live-buzzer",
          startedAt: now - 60_000,
          updatedAt: now,
          teacherPresenceAt: now,
          studentPresence: { "student-1": now },
          noPresenceSince: null
        }
      }), { status: 200 });
    }
    if (value.includes("/classroomGameResults/SM123/student-1/sm_SM123_run001.json")) {
      if (!init.method || init.method === "GET") {
        return new Response("null", {
          status: 200,
          headers: { ETag: '"null-etag"' }
        });
      }
      if (init.method === "PUT") {
        writes.push(JSON.parse(init.body));
        return new Response(init.body, { status: 200 });
      }
    }
    throw new Error("Unexpected fetch: " + value + " " + (init.method || "GET"));
  };

  try {
    const response = await submitResult({
      request: new Request("https://youteach.pages.dev/api/cog-live-result-submit", {
        method: "POST",
        headers: {
          Origin: "https://classroom-online-games.pages.dev",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ result: supportResult })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].metrics, supportResult.metrics);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
