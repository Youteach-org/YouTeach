import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const js = readFileSync(join(root, "student-buzzer.js"), "utf8");
const html = readFileSync(join(root, "student-buzzer.html"), "utf8");

test("Student Buzzer includes a hidden generic live game card", () => {
  assert.match(html, /id="liveGameCard"[^>]*hidden/);
  assert.match(html, /id="liveGameName"/);
  assert.match(html, /id="joinLiveGameBtn"/);
});

test("live game visibility uses connectedGame status and student group", () => {
  assert.match(js, /canStudentAccessLiveGame/);
  assert.match(js, /connectedGame/);
  assert.match(js, /currentStudent.*groupName|groupName.*currentStudent/s);
});

test("student can return to the active game while the live session remains active", () => {
  assert.match(js, /RETURN TO GAME|JOIN GAME/);
  assert.match(js, /joinLiveGameBtn/);
});


test("Student Buzzer reevaluates live-game expiry even without a Firebase state change", () => {
  assert.match(js, /setInterval\([^;]*renderBuzzer[\s\S]*30000|setInterval\(\(\)=>renderBuzzer\(\),30000\)/);
});


test("Student Buzzer asks YouTeach to persist logical live-game expiry", () => {
  assert.match(js, /\/api\/cog-live-expire/);
  assert.match(js, /getStudentSessionToken/);
  assert.match(js, /Authorization/);
  assert.match(js, /refreshLiveGameExpiry/);
});


test("100 Students Said stays inside Student Buzzer instead of showing a broken external JOIN GAME", () => {
  assert.match(js, /gameId\s*===\s*"100-students-said"/);
  assert.match(js, /buzzerNativeGame/);
  assert.match(js, /liveGameCard\.hidden\s*=\s*!connectedGame\s*\|\|\s*buzzerNativeGame/);
});
