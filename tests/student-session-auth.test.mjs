import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const studentAuth = readFileSync(join(root, "student-auth.js"), "utf8");
const studentSessionFn = readFileSync(join(root, "functions", "api", "student-session.js"), "utf8");
const teacherSessionFn = readFileSync(join(root, "functions", "api", "teacher-session.js"), "utf8");
const studentSessionShared = readFileSync(join(root, "functions", "_shared", "student-session.js"), "utf8");
const teacherSessionShared = readFileSync(join(root, "functions", "_shared", "teacher-session.js"), "utf8");

test("student login requests a server-issued signed session", () => {
  assert.match(studentAuth, /fetch\("\/api\/student-session"/);
  assert.match(studentAuth, /youteachStudentSessionToken/);
  assert.doesNotMatch(studentAuth, /password\s*!==\s*validPassword/);
});

test("student session is HMAC signed with a server-only environment secret", () => {
  assert.match(studentSessionShared, /HMAC/);
  assert.match(studentSessionShared, /SHA-256/);
  assert.match(studentSessionFn, /env\.YOUTEACH_SESSION_SECRET/);
});

test("teacher session is HMAC signed with the same server-only environment boundary", () => {
  assert.match(teacherSessionShared, /HMAC/);
  assert.match(teacherSessionShared, /SHA-256/);
  assert.match(teacherSessionFn, /env\.YOUTEACH_SESSION_SECRET/);
});

test("session endpoints use private credential storage instead of browser-visible password records", () => {
  assert.match(studentSessionFn, /env\.YOUTEACH_AUTH/);
  assert.match(teacherSessionFn, /env\.YOUTEACH_AUTH/);
  assert.match(studentSessionFn, /verifyPassword/);
  assert.match(teacherSessionFn, /verifyPassword/);
});
