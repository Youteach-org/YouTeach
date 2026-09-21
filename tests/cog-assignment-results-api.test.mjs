import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { signTeacherSession } from "../functions/_shared/teacher-session.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function resultsApi() {
  return import("../functions/api/cog-assignment-results.js").catch(() => null);
}

test("teacher COG results API rejects requests without a signed teacher session", async () => {
  const api = await resultsApi();
  assert.ok(api?.onRequestGet, "cog-assignment-results API must exist");

  const response = await api.onRequestGet({
    request: new Request("https://youteach.pages.dev/api/cog-assignment-results"),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });

  assert.equal(response.status, 401);
});

test("teacher COG results API returns the assignment index after teacher authentication", async () => {
  const api = await resultsApi();
  assert.ok(api?.onRequestGet, "cog-assignment-results API must exist");

  const now = Date.now();
  const token = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    iat: now - 1000,
    exp: now + 60_000
  }, SECRET);

  const expected = {
    "assignment-cog-1": {
      "ghost-01": {
        receipt1: {
          resultId: "receipt1",
          studentKey: "ghost-01",
          assignmentId: "assignment-cog-1",
          gameId: "verb-runner",
          percentage: 85
        }
      }
    }
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(init.method || "GET", "GET");
    assert.match(String(url), /\/classroomGameResultsByAssignment\.json$/);
    return new Response(JSON.stringify(expected), { status: 200 });
  };

  try {
    const response = await api.onRequestGet({
      request: new Request("https://youteach.pages.dev/api/cog-assignment-results", {
        headers: { Authorization: "Bearer " + token }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.results, expected);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("teacher Assignments loads COG results through the authenticated API, not a direct Firebase listener", async () => {
  const source = await readFile(new URL("../teacher-assignments.js", import.meta.url), "utf8");

  assert.match(source, /\/api\/cog-assignment-results/);
  assert.match(source, /getTeacherSessionToken\(\)/);
  assert.doesNotMatch(
    source,
    /onValue\(ref\(db,\s*["']classroomGameResultsByAssignment["']/
  );
});
