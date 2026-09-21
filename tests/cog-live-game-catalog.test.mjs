import test from "node:test";
import assert from "node:assert/strict";

import { LIVE_COG_GAMES } from "../functions/_shared/cog-live-http.js";

test("YouTeach live COG catalog exposes the approved game ids including Talk Talk", () => {
  assert.deepEqual(
    Object.keys(LIVE_COG_GAMES).sort(),
    ["100-students-said", "osascomp", "support-meter", "talk-talk", "verb-runner"].sort()
  );
});

test("student launch routes match the canonical COG public paths", () => {
  assert.equal(LIVE_COG_GAMES["verb-runner"].studentPath, "/Verb-Runner/");
  assert.equal(LIVE_COG_GAMES["support-meter"].studentPath, "/Support-Meter/");
  assert.equal(LIVE_COG_GAMES.osascomp.studentPath, "/OSASCOMP/");
  assert.equal(LIVE_COG_GAMES["talk-talk"].studentPath, "/Talk-Talk/");
});

test("100 Students Said is explicitly a Student Buzzer-native game", () => {
  assert.equal(LIVE_COG_GAMES["100-students-said"].studentPath, null);
  assert.equal(LIVE_COG_GAMES["100-students-said"].studentSurface, "buzzer");
});
