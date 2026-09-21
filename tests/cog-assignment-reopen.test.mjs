import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = readFileSync(join(root, "teacher-assignments.js"), "utf8");

test("existing active COG assignments expose an assignment-scoped OPEN COG action", () => {
  assert.match(source, /assignmentTypeCodeFor\(assignment\).*===\s*"COG"/s);
  assert.match(source, /data-open-cog-assignment=/);
  assert.match(source, /OPEN COG/);
});

test("OPEN COG uses signed teacher session and the canonical assignment id", () => {
  assert.match(source, /getTeacherSessionToken/);
  assert.match(source, /\/api\/cog-live-teacher-launch/);
  assert.match(source, /JSON\.stringify\(\{\s*assignmentId\s*\}\)/);
  assert.match(source, /Authorization/);
  assert.match(source, /Bearer/);
});

test("OPEN COG prepares a browser tab before awaiting the launch endpoint", () => {
  const start = source.indexOf("async function openCogAssignment");
  assert.ok(start >= 0);
  const fn = source.slice(start, start + 2600);
  const windowOpen = fn.indexOf('window.open("about:blank", "_blank")');
  const fetchCall = fn.indexOf('await fetch("/api/cog-live-teacher-launch"');
  assert.ok(windowOpen >= 0);
  assert.ok(fetchCall > windowOpen);
});

test("assignment list click handling intercepts OPEN COG before selecting the card", () => {
  const listener = source.indexOf('teacherAssignmentList.addEventListener("click"');
  assert.ok(listener >= 0);
  const block = source.slice(listener, listener + 2200);
  const cog = block.indexOf("[data-open-cog-assignment]");
  const select = block.indexOf("[data-assignment-select]");
  assert.ok(cog >= 0);
  assert.ok(select > cog);
});
