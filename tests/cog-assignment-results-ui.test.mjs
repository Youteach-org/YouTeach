import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as submitResult } from "../functions/api/cog-live-result-submit.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function liveToken() {
  const now = Date.now();
  return signCogLiveToken({
    purpose: "cog-live-student-session",
    studentKey: "ghost-01",
    externalId: "GHOST01",
    groupName: "533-2",
    youTeachSessionId: "yt-results-ui",
    assignmentId: "assignment-cog-1",
    gameId: "verb-runner",
    cogSessionId: "VR-ROOM-1",
    iat: now - 1000,
    exp: now + 60_000
  }, SECRET);
}

function liveSession() {
  const now = Date.now();
  return {
    active: true,
    sessionId: "yt-results-ui",
    groupName: "533-2",
    connectedGame: {
      gameId: "verb-runner",
      gameName: "Verb Runner",
      cogSessionId: "VR-ROOM-1",
      groupName: "533-2",
      assignmentId: "assignment-cog-1",
      recipientStudentKeys: ["ghost-01"],
      status: "active",
      launchMode: "live-buzzer",
      startedAt: now - 60_000,
      updatedAt: now,
      teacherPresenceAt: now,
      studentPresence: { "ghost-01": now },
      noPresenceSince: null
    }
  };
}

function resultEnvelope() {
  return {
    schemaVersion: 1,
    resultId: "vr_VRROOM1_ghost01_attempt1",
    attemptId: "attempt1",
    resultType: "individual",
    completedAt: Date.now(),
    percentage: 85,
    points: null,
    metrics: {
      correct: 17,
      errors: 3,
      obstacleHits: 1,
      bestStreak: 8,
      timeMs: 123000,
      mode: "verb-hunt",
      difficulty: "medium"
    }
  };
}

test("accepted COG receipt is mirrored into the assignment/student result index", async () => {
  const token = await liveToken();
  let assignmentIndexWrites = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const method = init.method || "GET";

    if (value.endsWith("/session/current.json") && method === "GET") {
      return new Response(JSON.stringify(liveSession()), { status: 200 });
    }

    if (value.includes("/classroomGameResults/VR-ROOM-1/ghost-01/vr_VRROOM1_ghost01_attempt1.json")) {
      if (method === "GET") {
        return new Response("null", {
          status: 200,
          headers: { ETag: '"null-etag"' }
        });
      }
      if (method === "PUT") {
        return new Response(init.body, { status: 200 });
      }
    }

    if (value.includes("/classroomGameResultsByAssignment/assignment-cog-1/ghost-01/vr_VRROOM1_ghost01_attempt1.json")) {
      if (method === "PUT") {
        assignmentIndexWrites += 1;
        const body = JSON.parse(init.body);
        assert.equal(body.assignmentId, "assignment-cog-1");
        assert.equal(body.studentKey, "ghost-01");
        assert.equal(body.gameId, "verb-runner");
        assert.equal(body.percentage, 85);
        return new Response(init.body, { status: 200 });
      }
    }

    throw new Error("Unexpected fetch: " + value + " " + method);
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
        body: JSON.stringify({ result: resultEnvelope() })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });

    assert.equal(response.status, 200);
    assert.equal(assignmentIndexWrites, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("COG assignment result model preserves attempt history and exposes game-specific metrics", async () => {
  const model = await import("../cog-assignment-results.mjs").catch(() => null);
  assert.ok(model, "cog-assignment-results.mjs must exist");

  const results = {
    "ghost-01": {
      older: {
        resultId: "older",
        studentKey: "ghost-01",
        gameId: "verb-runner",
        completedAt: 100,
        acceptedAt: 110,
        percentage: 70,
        metrics: { correct: 14, errors: 6 }
      },
      newer: {
        resultId: "newer",
        studentKey: "ghost-01",
        gameId: "verb-runner",
        completedAt: 200,
        acceptedAt: 210,
        percentage: 90,
        metrics: { correct: 18, errors: 2, bestStreak: 7 }
      }
    }
  };

  const history = model.cogResultHistoryForStudent(results, "ghost-01");
  assert.deepEqual(history.map((item) => item.resultId), ["newer", "older"]);
  assert.equal(model.studentHasCogResult(results, "ghost-01"), true);
  assert.equal(model.studentHasCogResult(results, "ghost-02"), false);

  const metricEntries = model.cogMetricEntries(history[0]);
  assert.deepEqual(
    metricEntries.map((entry) => entry.label),
    ["Correct", "Errors", "Best streak"]
  );
});

test("teacher Assignments has a dedicated COG results surface instead of treating receipts as grades", async () => {
  const [js, html] = await Promise.all([
    readFile(new URL("../teacher-assignments.js", import.meta.url), "utf8"),
    readFile(new URL("../teacher-assignments.html", import.meta.url), "utf8")
  ]);

  assert.match(js, /\/api\/cog-assignment-results/);
  assert.match(js, /cogResultHistoryForStudent/);
  assert.match(html, /id="cogResultsPanel"/);
  assert.match(html, /id="cogResultsList"/);
  assert.doesNotMatch(html, /COG grade/i);
});
