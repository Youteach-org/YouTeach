import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  allowedCogOrigin,
  cogOriginForRequest
} from "../functions/_shared/cog-live-http.js";
import { LIVE_COG_IDLE_TTL_MS } from "../cog-live-session-policy.mjs";

const CONTRACT = Object.freeze({
  schemaVersion: 1,
  teacherTokenPurpose: "cog-live-teacher",
  studentTokenPurpose: "cog-live-student",
  launchMode: "live-buzzer",
  idleTtlMs: 60 * 60 * 1000,
  youTeachOrigin: "https://youteach.pages.dev",
  cogOrigin: "https://utichgion.org",
  descriptorFields: [
    "gameId",
    "gameName",
    "cogSessionId",
    "assignmentId",
    "assignmentCode",
    "assignmentTitle",
    "groupName",
    "status",
    "launchMode",
    "youTeachSessionId",
    "recipientMode",
    "recipientStudentKeys",
    "startedAt",
    "updatedAt",
    "teacherPresenceAt",
    "noPresenceSince",
    "endedAt",
    "expiredAt"
  ],
  resultEnvelopeFields: [
    "schemaVersion",
    "resultId",
    "attemptId",
    "resultType",
    "completedAt",
    "percentage",
    "points",
    "metrics"
  ]
});

async function source(path) {
  return readFile(new URL("../" + path, import.meta.url), "utf8");
}

test("YouTeach pins the exact live COG token, origin, launch-mode and inactivity contract", async () => {
  const [teacherLaunch, studentLaunch, register] = await Promise.all([
    source("functions/api/cog-live-teacher-launch.js"),
    source("functions/api/cog-live-student-launch.js"),
    source("functions/api/cog-live-session-register.js")
  ]);

  assert.match(teacherLaunch, new RegExp('purpose:\\s*"' + CONTRACT.teacherTokenPurpose + '"'));
  assert.match(studentLaunch, new RegExp('purpose:\\s*"' + CONTRACT.studentTokenPurpose + '"'));
  assert.match(register, new RegExp('launchMode:\\s*"' + CONTRACT.launchMode + '"'));

  assert.equal(
    cogOriginForRequest(new Request(CONTRACT.youTeachOrigin + "/api/cog-live-teacher-launch")),
    CONTRACT.cogOrigin
  );
  assert.equal(
    allowedCogOrigin(new Request(CONTRACT.youTeachOrigin + "/api/cog-live-heartbeat", {
      headers: { Origin: CONTRACT.cogOrigin }
    })),
    CONTRACT.cogOrigin
  );
  assert.equal(
    allowedCogOrigin(new Request(CONTRACT.youTeachOrigin + "/api/cog-live-heartbeat", {
      headers: { Origin: "https://feature-live.classroom-online-games.pages.dev" }
    })),
    "https://feature-live.classroom-online-games.pages.dev"
  );
  assert.equal(
    allowedCogOrigin(new Request(CONTRACT.youTeachOrigin + "/api/cog-live-heartbeat", {
      headers: { Origin: "http://classroom-online-games.pages.dev" }
    })),
    null
  );
  assert.equal(
    allowedCogOrigin(new Request(CONTRACT.youTeachOrigin + "/api/cog-live-heartbeat", {
      headers: { Origin: "https://example.com" }
    })),
    null
  );

  assert.equal(LIVE_COG_IDLE_TTL_MS, CONTRACT.idleTtlMs);

  for (const field of CONTRACT.descriptorFields) {
    assert.match(register, new RegExp("\\b" + field + "\\b"));
  }
});

test("YouTeach result ingestion pins schemaVersion 1 and the canonical result envelope", async () => {
  const resultSubmit = await source("functions/api/cog-live-result-submit.js");

  assert.match(
    resultSubmit,
    new RegExp("schemaVersion\\s*:\\s*" + CONTRACT.schemaVersion)
  );
  for (const field of CONTRACT.resultEnvelopeFields) {
    assert.match(resultSubmit, new RegExp("\\b" + field + "\\b"));
  }
});
