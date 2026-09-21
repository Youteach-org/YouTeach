import test from "node:test";
import assert from "node:assert/strict";

import { LIVE_COG_GAMES } from "../functions/_shared/cog-live-http.js";

test("YouTeach live COG catalog exposes exactly the four approved game ids", () => {
  assert.deepEqual(
    Object.keys(LIVE_COG_GAMES).sort(),
    ["100-students-said", "osascomp", "support-meter", "verb-runner"].sort()
  );
});

test("student launch routes match the canonical COG public paths", () => {
  assert.equal(LIVE_COG_GAMES["verb-runner"].studentPath, "/Verb-Runner/");
  assert.equal(LIVE_COG_GAMES["support-meter"].studentPath, "/Support-Meter/");
  assert.equal(LIVE_COG_GAMES.osascomp.studentPath, "/OSASCOMP/");
});

test("100 Students Said is explicitly a Student Buzzer-native game", () => {
  assert.equal(LIVE_COG_GAMES["100-students-said"].studentPath, null);
  assert.equal(LIVE_COG_GAMES["100-students-said"].studentSurface, "buzzer");
});
