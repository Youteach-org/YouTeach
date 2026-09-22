import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  LIVE_COG_GAMES,
  cogOriginForRequest,
  allowedCogOrigin
} from "../functions/_shared/cog-live-http.js";

test("Talk Talk Firebase branch preserves the current YouTeach login flow", async () => {
  const teacherLogin=await readFile(new URL("../teacher-login.js",import.meta.url),"utf8");
  const teacherAuth=await readFile(new URL("../teacher-auth.js",import.meta.url),"utf8");
  const studentAuth=await readFile(new URL("../student-auth.js",import.meta.url),"utf8");

  assert.match(teacherLogin,/const\s+USERS\s*=/);
  assert.match(teacherLogin,/youteachTeacherAuth/);
  assert.doesNotMatch(teacherLogin,/\/api\/teacher-session/);
  assert.match(teacherAuth,/youteachTeacherAuth/);
  assert.doesNotMatch(teacherAuth,/youteachTeacherSession/);
  assert.doesNotMatch(studentAuth,/\/api\/student-session/);
  assert.match(studentAuth,/get\(ref\(db,\s*"students"\)\)/);
});

test("Live COG catalog includes Talk Talk", () => {
  assert.deepEqual(LIVE_COG_GAMES["talk-talk"], {
    id:"talk-talk",
    name:"Talk Talk",
    studentPath:"/Talk-Talk/"
  });
});

test("production YouTeach launches COG on utichgion.org", () => {
  const request=new Request("https://youteach.pages.dev/api/cog-live-teacher-launch");
  assert.equal(cogOriginForRequest(request),"https://utichgion.org");
});

test("Talk Talk preview maps to matching COG preview", () => {
  const request=new Request("https://talk-talk-v1-20260921.youteach.pages.dev/api/cog-live-teacher-launch");
  assert.equal(
    cogOriginForRequest(request),
    "https://talk-talk-v1-20260921.classroom-online-games.pages.dev"
  );
});

test("utichgion.org is an allowed COG origin", () => {
  const request=new Request("https://youteach.pages.dev/api/cog-live-student-resolve",{
    method:"POST",
    headers:{Origin:"https://utichgion.org"}
  });
  assert.equal(allowedCogOrigin(request),"https://utichgion.org");
});
