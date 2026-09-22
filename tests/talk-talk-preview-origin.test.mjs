import test from "node:test";
import assert from "node:assert/strict";

import { resolveCogLiveOrigin } from "../functions/_shared/cog-live-origin.js";

test("production YouTeach defaults live COG to utichgion.org", () => {
  assert.equal(
    resolveCogLiveOrigin({}, "https://youteach.pages.dev/api/cog-live-teacher-launch"),
    "https://utichgion.org"
  );
});

test("custom YouTeach production host still defaults live COG to utichgion.org", () => {
  assert.equal(
    resolveCogLiveOrigin({}, "https://app.example.org/api/cog-live-teacher-launch"),
    "https://utichgion.org"
  );
});

test("Talk Talk YouTeach preview maps to the matching COG preview", () => {
  assert.equal(
    resolveCogLiveOrigin({}, "https://talk-talk-v1-20260921.youteach.pages.dev/api/cog-live-student-launch"),
    "https://talk-talk-v1-20260921.classroom-online-games.pages.dev"
  );
});

test("explicit COG_LIVE_ORIGIN overrides preview inference when allowed", () => {
  assert.equal(
    resolveCogLiveOrigin(
      { COG_LIVE_ORIGIN:" https://utichgion.org " },
      "https://talk-talk-v1-20260921.youteach.pages.dev/api/cog-live-teacher-launch"
    ),
    "https://utichgion.org"
  );
});

test("invalid or insecure COG live origin is rejected", () => {
  assert.throws(
    () => resolveCogLiveOrigin({ COG_LIVE_ORIGIN:"http://utichgion.org" }, "https://youteach.pages.dev/"),
    /Invalid Classroom Online Games live origin/
  );
  assert.throws(
    () => resolveCogLiveOrigin({ COG_LIVE_ORIGIN:"https://evil.example" }, "https://youteach.pages.dev/"),
    /Invalid Classroom Online Games live origin/
  );
});
