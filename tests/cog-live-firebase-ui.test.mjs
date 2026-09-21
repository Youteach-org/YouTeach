import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

test("COG assignment creation opens the Firebase-backed teacher launch without replacing teacher login", () => {
  const create = source("assignment-create-module.js");
  const teacherAuth = source("teacher-auth.js");

  assert.match(create, /fetch\("\/api\/cog-live-teacher-launch"/);
  assert.match(create, /body:\s*JSON\.stringify\(\{\s*assignmentId\s*\}\)/s);
  assert.match(create, /typeCode\s*===\s*"COG"/);
  assert.match(create, /launchCogAssignment\(target\.key/);
  assert.doesNotMatch(create, /getTeacherSessionToken|Authorization:\s*`Bearer/);
  assert.match(teacherAuth, /youteachTeacherAuth/);
  assert.doesNotMatch(teacherAuth, /youteachTeacherSession/);
});

test("Student Buzzer uses one dynamic live-game card and removes the permanent Verb Runner launcher", () => {
  const html = source("student-buzzer.html");
  const js = source("student-buzzer.js");

  assert.doesNotMatch(html, /id="openVerbRunnerBtn"/);
  assert.match(html, /id="liveGameCard"[^>]*hidden/);
  assert.match(html, /id="liveGameName"/);
  assert.match(html, /id="joinLiveGameBtn"/);

  assert.doesNotMatch(js, /createVerbRunnerLaunchToken|verbRunnerV2\/launchTokens|createOpaqueLaunchToken/);
  assert.match(js, /canStudentAccessLiveGame/);
  assert.match(js, /\/api\/cog-live-student-launch/);
  assert.match(js, /JSON\.stringify\(\{\s*studentKey,\s*externalId\s*\}\)/s);
  assert.doesNotMatch(js, /getStudentSessionToken|Authorization:\s*`Bearer/);
  assert.match(js, /connectedGame\?\.gameId\s*===\s*"100-students-said"/);
  assert.match(js, /RETURN TO GAME|JOIN GAME/);
});

test("Firebase live-game policy scopes access by active status, group and exact recipients", async () => {
  const path = join(root, "cog-live-session-policy.mjs");
  assert.equal(existsSync(path), true, "cog-live-session-policy.mjs must exist");
  const { canStudentAccessLiveGame } = await import(pathToFileURL(path).href + "?t=" + Date.now());

  const base = {
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "VR-123",
    groupName: "FANTASMA",
    status: "active",
    launchMode: "live-buzzer",
    recipientStudentKeys: ["ghost-key-1"],
    startedAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    teacherPresenceAt: Date.now() - 1000,
    noPresenceSince: null
  };

  assert.equal(canStudentAccessLiveGame({
    connectedGame: base,
    studentGroup: "FANTASMA",
    studentKey: "ghost-key-1",
    now: Date.now()
  }), true);

  assert.equal(canStudentAccessLiveGame({
    connectedGame: base,
    studentGroup: "OTHER",
    studentKey: "ghost-key-1",
    now: Date.now()
  }), false);

  assert.equal(canStudentAccessLiveGame({
    connectedGame: base,
    studentGroup: "FANTASMA",
    studentKey: "ghost-key-2",
    now: Date.now()
  }), false);

  assert.equal(canStudentAccessLiveGame({
    connectedGame: { ...base, status: "ended" },
    studentGroup: "FANTASMA",
    studentKey: "ghost-key-1",
    now: Date.now()
  }), false);
});
