import test from "node:test";
import assert from "node:assert/strict";

import {
  signStudentSession,
  verifyStudentSession
} from "../functions/_shared/student-session.js";
import {
  signTeacherSession,
  verifyTeacherSession
} from "../functions/_shared/teacher-session.js";

const SECRET = "test-session-secret-abcdefghijklmnopqrstuvwxyz-123456";

test("signed student sessions verify, reject tampering and expire", async () => {
  const now = Date.now();
  const token = await signStudentSession({
    studentKey: "student-1",
    externalId: "A001",
    iat: now,
    exp: now + 60_000,
    nonce: "abc"
  }, SECRET);

  const verified = await verifyStudentSession(token, SECRET, now + 1_000);
  assert.equal(verified?.studentKey, "student-1");
  assert.equal(verified?.externalId, "A001");

  const parts = token.split(".");
  const tampered = [parts[0], parts[1].slice(0, -1) + (parts[1].endsWith("A") ? "B" : "A"), parts[2]].join(".");
  assert.equal(await verifyStudentSession(tampered, SECRET, now + 1_000), null);
  assert.equal(await verifyStudentSession(token, SECRET, now + 120_000), null);
});

test("signed teacher sessions verify, reject tampering and expire", async () => {
  const now = Date.now();
  const token = await signTeacherSession({
    username: "teacher",
    role: "teacher",
    displayName: "Teacher",
    credentialRevision: 2,
    iat: now,
    exp: now + 60_000,
    nonce: "xyz"
  }, SECRET);

  const verified = await verifyTeacherSession(token, SECRET, now + 1_000);
  assert.equal(verified?.username, "teacher");
  assert.equal(verified?.role, "teacher");
  assert.equal(verified?.displayName, "Teacher");

  const parts = token.split(".");
  const tampered = [parts[0], parts[1].slice(0, -1) + (parts[1].endsWith("A") ? "B" : "A"), parts[2]].join(".");
  assert.equal(await verifyTeacherSession(tampered, SECRET, now + 1_000), null);
  assert.equal(await verifyTeacherSession(token, SECRET, now + 120_000), null);
});
