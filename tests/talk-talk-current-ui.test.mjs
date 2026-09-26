import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("current Ghost Lab remains available with Add Students and Existing enrollment", async () => {
  const ghost=await readFile(new URL("../teacher-ghost-lab.html",import.meta.url),"utf8");
  const teacher=await readFile(new URL("../teacher.html",import.meta.url),"utf8");

  assert.match(ghost,/id="openAddStudentModalBtn"/);
  assert.match(ghost,/id="existingStudentTabBtn"/);
  assert.match(ghost,/id="enrollExistingStudentsBtn"/);
  assert.match(teacher,/href="teacher-ghost-lab\.html"/);
  assert.doesNotMatch(teacher,/Active Today/);
});

test("Buzzer exposes Launch Talk Talk only after teams exist", async () => {
  const html=await readFile(new URL("../buzzer.html",import.meta.url),"utf8");
  const source=await readFile(new URL("../buzzer.js",import.meta.url),"utf8");

  assert.match(html,/id="launchTalkTalkBtn"/);
  assert.match(html,/>Launch Talk Talk</);
  assert.match(source,/function renderTalkTalkLaunchButton/);
  assert.match(source,/launchTalkTalkBtn\.disabled\s*=\s*!context/);
  assert.match(source,/async function launchTalkTalk/);
  assert.match(source,/cogGameId:\s*"talk-talk"/);
  assert.match(source,/Tell Me What Happened/);
  assert.match(source,/\/api\/cog-live-teacher-launch/);
});
