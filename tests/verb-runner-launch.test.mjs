import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const js = readFileSync(join(root, "student-buzzer.js"), "utf8");
const html = readFileSync(join(root, "student-buzzer.html"), "utf8");

test("Student menu has no permanent Verb Runner launcher", () => {
  assert.doesNotMatch(html, /id="openVerbRunnerBtn"/);
  assert.doesNotMatch(html, />\s*Verb Runner\s*<\/button>/);
});

test("Student Buzzer no longer mints legacy Verb Runner launch tokens in public Firebase", () => {
  assert.doesNotMatch(js, /createVerbRunnerLaunchToken/);
  assert.doesNotMatch(js, /verbRunnerV2\/launchTokens/);
  assert.doesNotMatch(js, /createOpaqueLaunchToken/);
});

test("live game access is requested from YouTeach server", () => {
  assert.match(js, /\/api\/cog-live-student-launch/);
  assert.match(js, /getStudentSessionToken/);
  assert.match(js, /Authorization/);
});
