import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { signTeacherSession } from "../functions/_shared/teacher-session.js";
import { verifyCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as createTeacherLaunch } from "../functions/api/cog-live-teacher-launch.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

test("Buzzer requests an authenticated COG teacher launch instead of opening a bare URL", () => {
  const source = readFileSync(join(root, "buzzer.js"), "utf8");
  assert.match(source, /getTeacherSessionToken/);
  assert.match(source, /fetch\("\/api\/cog-live-teacher-launch"/);
  assert.match(source, /Authorization/);
  assert.doesNotMatch(source, /window\.open\("https:\/\/classroom-online-games\.pages\.dev\/teacher\/"\s*,/);
});

test("teacher launch rejects missing authentication before Firebase access", async () => {
  const response = await createTeacherLaunch({
    request: new Request("https://youteach.pages.dev/api/cog-live-teacher-launch", { method: "POST" }),
    env: { YOUTEACH_SESSION_SECRET: SECRET }
  });
  assert.equal(response.status, 401);
});

test("teacher launch reads canonical active Buzzer group and signs it", async () => {
  const now = Date.now();
  const teacherSession = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    credentialRevision: 1,
    iat: now,
    exp: now + 60 * 60 * 1000
  }, SECRET);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify({
        active: true,
        createdAt: 123456789,
        groupName: "533-2",
        assignments: {}
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await createTeacherLaunch({
      request: new Request("https://preview.youteach.pages.dev/api/cog-live-teacher-launch", {
        method: "POST",
        headers: { Authorization: "Bearer " + teacherSession }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const url = new URL(payload.launchUrl);
    assert.equal(url.origin, "https://classroom-online-games.pages.dev");
    assert.equal(url.pathname, "/teacher/");
    assert.equal(url.searchParams.get("issuer"), "https://preview.youteach.pages.dev");
    const launch = await verifyCogLiveToken(url.searchParams.get("ytLiveTeacher"), SECRET, now + 1000);
    assert.equal(launch?.purpose, "cog-live-teacher");
    assert.equal(launch?.groupName, "533-2");
    assert.equal(launch?.youTeachSessionId, "123456789");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("teacher launch rejects when no active Buzzer session exists", async () => {
  const now = Date.now();
  const teacherSession = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    credentialRevision: 1,
    iat: now,
    exp: now + 60 * 60 * 1000
  }, SECRET);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ active: false }), { status: 200 });
  try {
    const response = await createTeacherLaunch({
      request: new Request("https://youteach.pages.dev/api/cog-live-teacher-launch", {
        method: "POST",
        headers: { Authorization: "Bearer " + teacherSession }
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });
    assert.equal(response.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
