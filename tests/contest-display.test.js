import test from "node:test";
import assert from "node:assert/strict";
import { createContestSession, applyContestCommand } from "../contest-core.js";
import { startTimer } from "../contest-timers.js";
import { buildPublicDisplay, buildTeacherGuide } from "../contest-display.js";
import { reportedSpeechContest } from "../contest-seed.js";

const config = {
  contestId: reportedSpeechContest.id,
  strikeLimit: 2,
  teams: [
    { id: "team1", name: "Team One", students: ["s1", "s2"] },
    { id: "team2", name: "Team Two", students: ["s3", "s4"] }
  ],
  rounds: reportedSpeechContest.rounds.map((round) => ({
    multiplier: round.multiplier,
    activityIds: round.activities.map((activity) => activity.id)
  }))
};

function activeSession() {
  let session = createContestSession(config, () => 0.999);
  session = applyContestCommand(session, { type: "START_ROUND", at: 0 });
  session.timers.round = startTimer(60_000, 0);
  session.timers.response = startTimer(10_000, 2_000);
  return session;
}

test("public display never includes private answer fields or future answers", () => {
  const publicState = buildPublicDisplay(activeSession(), reportedSpeechContest, 5_000);
  const serialized = JSON.stringify(publicState);
  assert.equal(serialized.includes("modelAnswer"), false);
  assert.equal(serialized.includes("acceptedAlternatives"), false);
  assert.equal(serialized.includes("teacherNotes"), false);
  assert.equal(serialized.includes(reportedSpeechContest.rounds[0].activities[1].modelAnswer), false);
});

test("teacher guide includes the current validation material", () => {
  const guide = buildTeacherGuide(activeSession(), reportedSpeechContest, 5_000);
  assert.equal(
    guide.teacherGuide.modelAnswer,
    reportedSpeechContest.rounds[0].activities[0].modelAnswer
  );
  assert.ok(guide.teacherGuide.explanation);
  assert.ok(guide.teacherGuide.studyReference);
});

test("model answer is public only after an explicit reveal command", () => {
  let session = activeSession();
  assert.equal(buildPublicDisplay(session, reportedSpeechContest, 5_000).activity.revealedModel, null);
  session = applyContestCommand(session, { type: "REVEAL_MODEL", at: 6_000 });
  assert.equal(
    buildPublicDisplay(session, reportedSpeechContest, 7_000).activity.revealedModel,
    reportedSpeechContest.rounds[0].activities[0].modelAnswer
  );
});

test("round and response timers remain separate", () => {
  const display = buildPublicDisplay(activeSession(), reportedSpeechContest, 5_000);
  assert.equal(display.roundTimer.remainingMs, 55_000);
  assert.equal(display.responseTimer.remainingMs, 7_000);
});

test("public display includes scoreboard, bank, strikes, and progress", () => {
  const display = buildPublicDisplay(activeSession(), reportedSpeechContest, 5_000);
  assert.equal(display.teams.length, 2);
  assert.equal(display.bank, 0);
  assert.equal(display.strikeLimit, 2);
  assert.equal(display.activity.progress, 1);
  assert.equal(display.activity.total, 10);
});
