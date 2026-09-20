import test from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_COG_IDLE_TTL_MS,
  validateConnectedGame,
  canStudentAccessLiveGame,
  nextPresenceState,
  shouldExpireConnectedGame,
  liveResultKey
} from "../cog-live-session-policy.mjs";

test("live COG TTL is exactly 60 minutes", () => {
  assert.equal(LIVE_COG_IDLE_TTL_MS, 60 * 60 * 1000);
});

test("same-group active game is visible and cross-group game is hidden", () => {
  const game = validateConnectedGame({
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "ABC123",
    groupName: "533-2",
    status: "active",
    launchMode: "live-buzzer",
    startedAt: 1000,
    updatedAt: 1000,
    teacherPresenceAt: 1000,
    noPresenceSince: null
  });
  assert.equal(canStudentAccessLiveGame({ connectedGame: game, studentGroup: "533-2", now: 2000 }), true);
  assert.equal(canStudentAccessLiveGame({ connectedGame: game, studentGroup: "533-1", now: 2000 }), false);
  assert.equal(canStudentAccessLiveGame({ connectedGame: { ...game, status: "ended" }, studentGroup: "533-2", now: 2000 }), false);
});

test("zero presence starts inactivity clock and any presence clears it", () => {
  const game = validateConnectedGame({
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "ABC123",
    groupName: "533-2",
    status: "active",
    launchMode: "live-buzzer",
    startedAt: 1000,
    updatedAt: 1000,
    teacherPresenceAt: 1000,
    noPresenceSince: null
  });

  const empty = nextPresenceState({
    connectedGame: game,
    teacherPresent: false,
    studentPresenceCount: 0,
    now: 5000
  });
  assert.equal(empty.noPresenceSince, 5000);

  const stillEmpty = nextPresenceState({
    connectedGame: empty,
    teacherPresent: false,
    studentPresenceCount: 0,
    now: 7000
  });
  assert.equal(stillEmpty.noPresenceSince, 5000);

  const returned = nextPresenceState({
    connectedGame: stillEmpty,
    teacherPresent: true,
    studentPresenceCount: 0,
    now: 9000
  });
  assert.equal(returned.noPresenceSince, null);
});

test("59:59 does not expire, 60:00 does", () => {
  const base = validateConnectedGame({
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "ABC123",
    groupName: "533-2",
    status: "active",
    launchMode: "live-buzzer",
    startedAt: 1000,
    updatedAt: 1000,
    teacherPresenceAt: 1000,
    noPresenceSince: 10_000
  });
  assert.equal(shouldExpireConnectedGame({ connectedGame: base, now: 10_000 + LIVE_COG_IDLE_TTL_MS - 1 }), false);
  assert.equal(shouldExpireConnectedGame({ connectedGame: base, now: 10_000 + LIVE_COG_IDLE_TTL_MS }), true);
});

test("result key is stable and session-scoped", () => {
  const args = { gameId: "verb-runner", cogSessionId: "ABC123", studentKey: "student-1", resultId: "attempt-9" };
  assert.equal(liveResultKey(args), liveResultKey(args));
  assert.notEqual(liveResultKey(args), liveResultKey({ ...args, cogSessionId: "OTHER" }));
});
