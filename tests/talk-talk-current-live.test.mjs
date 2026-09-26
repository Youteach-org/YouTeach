import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_COG_GAMES,
  cogOriginForRequest,
  allowedCogOrigin
} from "../functions/_shared/cog-live-http.js";

test("Talk Talk is a supported Live COG game with direct teacher route", () => {
  assert.deepEqual(LIVE_COG_GAMES["talk-talk"], {
    id:"talk-talk",
    name:"Talk Talk",
    studentPath:"/Talk-Talk/",
    teacherPath:"/Talk-Talk/teacher.html"
  });
});

test("production Live COG points to utichgion.org", () => {
  assert.equal(
    cogOriginForRequest(new Request("https://youteach.pages.dev/api/cog-live-teacher-launch")),
    "https://utichgion.org"
  );
  assert.equal(
    allowedCogOrigin(new Request("https://youteach.pages.dev/api/x",{headers:{Origin:"https://utichgion.org"}})),
    "https://utichgion.org"
  );
});
