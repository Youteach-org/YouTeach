import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { signCogLiveToken } from "../functions/_shared/cog-live-token.js";
import { onRequestPost as resolveStudentLaunch } from "../functions/api/cog-live-student-resolve.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

async function launchToken(now = Date.now()) {
  return signCogLiveToken({
    purpose: "cog-live-student",
    studentKey: "student-1",
    externalId: "A001",
    studentSessionExpiresAt: now + 60 * 60 * 1000,
    groupName: "533-2",
    youTeachSessionId: "yt-123",
    gameId: "talk-talk",
    gameName: "Talk Talk",
    cogSessionId: "TT123",
    assignmentId: "assignment-1",
    iat: now,
    exp: now + 60_000,
    nonce: "launch-nonce"
  }, SECRET);
}

function currentSession() {
  return {
    active: true,
    sessionId: "yt-123",
    createdAt: 123,
    groupName: "533-2",
    teamRevision: "yt-123:teams:1",
    teams: {
      team1: ["Sandra", "Paul"],
      team2: ["Nicole"]
    },
    assignments: {
      "student-1": "Team 1",
      "student-2": "Team 1",
      "student-3": "Team 2"
    },
    connectedGame: {
      gameId: "talk-talk",
      gameName: "Talk Talk",
      cogSessionId: "TT123",
      assignmentId: "assignment-1",
      groupName: "533-2",
      youTeachSessionId: "yt-123",
      status: "active",
      launchMode: "live-buzzer",
      startedAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      teacherPresenceAt: Date.now() - 1000,
      noPresenceSince: null
    }
  };
}

test("Talk Talk resolver derives team context from canonical YouTeach teams and ignores forged requested teamKey", async () => {
  const token = await launchToken();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/students/student-1.json")) {
      return new Response(JSON.stringify({
        fullName: "Sandra Alvarado",
        nickname: "Sandra",
        studentNumber: "A001",
        groupName: "533-2"
      }), { status: 200 });
    }
    if (value.endsWith("/session/current.json")) {
      return new Response(JSON.stringify(currentSession()), { status: 200 });
    }
    throw new Error("Unexpected fetch: " + value);
  };

  try {
    const response = await resolveStudentLaunch({
      request: new Request("https://youteach.pages.dev/api/cog-live-student-resolve", {
        method: "POST",
        headers: {
          Origin: "https://utichgion.org",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          teamKey: "team99",
          teamLabel: "Attackers"
        })
      }),
      env: { YOUTEACH_SESSION_SECRET: SECRET }
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.teamContext, {
      teamKey: "team1",
      teamLabel: "Team 1",
      memberKeys: ["student-1", "student-2"],
      memberNames: ["Sandra", "Paul"],
      teamRevision: "yt-123:teams:1"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Buzzer remains the only team generator and persists a team revision", async () => {
  const source = await readFile(new URL("../buzzer.js", import.meta.url), "utf8");
  assert.match(source, /buildSmartTeams\(/);
  assert.match(source, /savePairHistory\(/);
  assert.match(source, /teamRevision/);
  assert.doesNotMatch(source, /buildTalkTalkTeams/);
});
