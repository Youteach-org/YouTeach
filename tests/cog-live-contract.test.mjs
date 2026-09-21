import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  LIVE_COG_IDLE_TTL_MS,
  validateConnectedGame
} from "../cog-live-session-policy.mjs";
import { allowedCogOrigin } from "../functions/_shared/cog-live-http.js";

const CONTRACT = Object.freeze({
  schemaVersion: 2,
  teacherTokenPurpose: "cog-live-teacher",
  studentTokenPurpose: "cog-live-student",
  launchMode: "live-buzzer",
  idleTtlMs: 60 * 60 * 1000,
  youTeachOrigin: "https://youteach.pages.dev",
  cogOrigin: "https://classroom-online-games.pages.dev",
  descriptorFields: [
    "gameId",
    "gameName",
    "cogSessionId",
    "groupName",
    "assignmentId",
    "assignmentCode",
    "assignmentTitle",
    "recipientStudentKeys",
    "recipientTeamLabels",
    "recipientTeamTarget",
    "status",
    "launchMode",
    "startedAt",
    "updatedAt",
    "teacherPresenceAt",
    "studentPresence",
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

test("YouTeach live COG contract pins token purposes, launch mode, TTL and origins", async () => {
  const [teacherLaunch, studentLaunch, sessionRegister, resultSubmit] = await Promise.all([
    source("functions/api/cog-live-teacher-launch.js"),
    source("functions/api/cog-live-student-launch.js"),
    source("functions/api/cog-live-session-register.js"),
    source("functions/api/cog-live-result-submit.js")
  ]);

  assert.match(teacherLaunch, new RegExp('purpose:\\s*"' + CONTRACT.teacherTokenPurpose + '"'));
  assert.match(studentLaunch, new RegExp('purpose:\\s*"' + CONTRACT.studentTokenPurpose + '"'));
  assert.match(sessionRegister, new RegExp('launchMode:\\s*"' + CONTRACT.launchMode + '"'));
  assert.equal(LIVE_COG_IDLE_TTL_MS, CONTRACT.idleTtlMs);

  const prod = new Request(CONTRACT.youTeachOrigin, {
    headers: { Origin: CONTRACT.cogOrigin }
  });
  assert.equal(allowedCogOrigin(prod), CONTRACT.cogOrigin);

  const previewOrigin = "https://feature-live.classroom-online-games.pages.dev";
  const preview = new Request(CONTRACT.youTeachOrigin, {
    headers: { Origin: previewOrigin }
  });
  assert.equal(allowedCogOrigin(preview), previewOrigin);

  const rejected = new Request(CONTRACT.youTeachOrigin, {
    headers: { Origin: "https://example.com" }
  });
  assert.equal(allowedCogOrigin(rejected), null);

  assert.match(
    resultSubmit,
    new RegExp("schemaVersion\\s*!==\\s*" + CONTRACT.schemaVersion)
  );
});

test("YouTeach connected-game descriptor exposes the exact bridge field set", () => {
  const now = 1800000000000;
  const descriptor = validateConnectedGame({
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "VR-CONTRACT",
    groupName: "FANTASMA",
    assignmentId: "assignment-contract",
    assignmentCode: "COG-CONTRACT",
    assignmentTitle: "Contract",
    recipientStudentKeys: ["ghost-01"],
    recipientTeamLabels: ["Team 1"],
    recipientTeamTarget: "Team 1",
    status: "active",
    launchMode: CONTRACT.launchMode,
    startedAt: now,
    updatedAt: now,
    teacherPresenceAt: now,
    studentPresence: { "ghost-01": now },
    noPresenceSince: null,
    endedAt: null,
    expiredAt: null
  });

  assert.deepEqual(
    Object.keys(descriptor).sort(),
    [...CONTRACT.descriptorFields].sort()
  );
});

test("YouTeach result receiver pins every normalized result-envelope field", async () => {
  const resultSubmit = await source("functions/api/cog-live-result-submit.js");
  for (const field of CONTRACT.resultEnvelopeFields) {
    assert.match(resultSubmit, new RegExp("\\b" + field + "\\b"));
  }
});
