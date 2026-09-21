import test from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_COG_IDLE_TTL_MS,
  LIVE_COG_PRESENCE_STALE_MS,
  livePresenceState,
  shouldExpireConnectedGame
} from "../cog-live-session-policy.mjs";

function game(overrides = {}) {
  return {
    gameId: "verb-runner",
    gameName: "Verb Runner",
    cogSessionId: "ABC123",
    groupName: "533-2",
    assignmentId: "assignment-1",
    status: "active",
    launchMode: "live-buzzer",
    startedAt: 1_000,
    updatedAt: 1_000,
    teacherPresenceAt: 1_000,
    studentPresence: {},
    noPresenceSince: null,
    ...overrides
  };
}

test("presence remains active until heartbeat becomes stale", () => {
  const now = 100_000;
  const connectedGame = game({ teacherPresenceAt: now - LIVE_COG_PRESENCE_STALE_MS + 1 });
  const state = livePresenceState({ connectedGame, now });
  assert.equal(state.hasPresence, true);
  assert.equal(state.noPresenceSince, null);
  assert.equal(state.expired, false);
});

test("zero-presence clock begins when the last heartbeat becomes stale", () => {
  const lastSeen = 100_000;
  const now = lastSeen + LIVE_COG_PRESENCE_STALE_MS + 10_000;
  const state = livePresenceState({
    connectedGame: game({ teacherPresenceAt: lastSeen }),
    now
  });
  assert.equal(state.hasPresence, false);
  assert.equal(state.noPresenceSince, lastSeen + LIVE_COG_PRESENCE_STALE_MS);
  assert.equal(state.expired, false);
});

test("student presence keeps the live activity active after teacher leaves", () => {
  const now = 500_000;
  const connectedGame = game({
    teacherPresenceAt: 1_000,
    studentPresence: {
      "student-1": now - 10_000
    }
  });
  const state = livePresenceState({ connectedGame, now });
  assert.equal(state.hasPresence, true);
  assert.equal(state.expired, false);
});

test("activity expires only after 60 continuous minutes of zero presence", () => {
  const lastSeen = 100_000;
  const zeroSince = lastSeen + LIVE_COG_PRESENCE_STALE_MS;
  const connectedGame = game({ teacherPresenceAt: lastSeen });

  assert.equal(
    shouldExpireConnectedGame({
      connectedGame,
      now: zeroSince + LIVE_COG_IDLE_TTL_MS - 1
    }),
    false
  );
  assert.equal(
    shouldExpireConnectedGame({
      connectedGame,
      now: zeroSince + LIVE_COG_IDLE_TTL_MS
    }),
    true
  );
});

test("stored noPresenceSince is cleared logically by a fresh return heartbeat", () => {
  const now = 8_000_000;
  const connectedGame = game({
    teacherPresenceAt: now - 5_000,
    noPresenceSince: now - 30 * 60 * 1000
  });
  const state = livePresenceState({ connectedGame, now });
  assert.equal(state.hasPresence, true);
  assert.equal(state.noPresenceSince, null);
  assert.equal(state.expired, false);
});
