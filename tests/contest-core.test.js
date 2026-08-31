import test from "node:test";
import assert from "node:assert/strict";
import {
  createContestSession,
  getEligibleStudents,
  applyContestCommand
} from "../contest-core.js";

const config = {
  contestId: "reported-speech-demo",
  strikeLimit: 2,
  teams: [
    { id: "team1", name: "Team 1", students: ["s1", "s2"] },
    { id: "team2", name: "Team 2", students: ["s3", "s4"] }
  ],
  rounds: [
    { multiplier: 1, activityIds: ["a1", "a2", "a3"] },
    { multiplier: 2, activityIds: ["a4"] }
  ]
};

function fresh() {
  return createContestSession(config, () => 0.999);
}

test("creates a lobby without awarding points", () => {
  const state = fresh();
  assert.equal(state.phase, "lobby");
  assert.deepEqual(state.scores, { team1: 0, team2: 0 });
  assert.equal(state.roundBank, 0);
});

test("rejects invalid phase commands and invalid strike limits", () => {
  assert.throws(() => applyContestCommand(fresh(), { type: "MARK_CORRECT" }), /phase/);
  assert.throws(
    () => createContestSession({ ...config, strikeLimit: 4 }),
    /strikeLimit/
  );
});

test("only the two rotating leaders are eligible in a face-off", () => {
  const started = applyContestCommand(fresh(), { type: "START_ROUND", at: 1 });
  assert.equal(started.phase, "faceoff");
  assert.deepEqual(getEligibleStudents(started).sort(), ["s1", "s3"]);
  assert.equal(getEligibleStudents(started).includes("s2"), false);
});

test("a leader cannot buzz twice in the same face-off sequence", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND", at: 1 });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1", at: 2 });
  state = applyContestCommand(state, { type: "MARK_WRONG", at: 3 });
  assert.deepEqual(getEligibleStudents(state), ["s3"]);
  assert.throws(
    () => applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1", at: 4 }),
    /not eligible/
  );
});

test("wrong answers by both leaders rotate to the next leaders", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1" });
  state = applyContestCommand(state, { type: "MARK_WRONG" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s3" });
  state = applyContestCommand(state, { type: "MARK_WRONG" });
  assert.deepEqual(getEligibleStudents(state).sort(), ["s2", "s4"]);
});

test("correct face-off answer gives control and automatic bank points", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1" });
  state = applyContestCommand(state, { type: "MARK_CORRECT", points: 5 });
  assert.equal(state.controlTeamId, "team1");
  assert.equal(state.roundBank, 5);
  assert.equal(state.phase, "control_ready");
  assert.equal(state.activityIndex, 1);
});

test("assigned turns rotate and two strikes offer a steal", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1" });
  state = applyContestCommand(state, { type: "MARK_CORRECT", points: 5 });

  state = applyContestCommand(state, { type: "OPEN_ACTIVITY" });
  assert.equal(state.activeStudentKey, "s2");
  state = applyContestCommand(state, { type: "MARK_WRONG" });

  state = applyContestCommand(state, { type: "OPEN_ACTIVITY" });
  assert.equal(state.activeStudentKey, "s1");
  state = applyContestCommand(state, { type: "MARK_WRONG" });

  assert.equal(state.strikes.team1, 2);
  assert.equal(state.phase, "steal_ready");
  state = applyContestCommand(state, { type: "OPEN_ACTIVITY" });
  assert.equal(state.activeStudentKey, "s4");
  assert.deepEqual(getEligibleStudents(state), ["s4"]);
});

test("successful steal awards the bank without teacher arithmetic", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1" });
  state = applyContestCommand(state, { type: "MARK_CORRECT", points: 5 });
  state = applyContestCommand(state, { type: "OPEN_ACTIVITY" });
  state = applyContestCommand(state, { type: "MARK_WRONG" });
  state = applyContestCommand(state, { type: "OPEN_ACTIVITY" });
  state = applyContestCommand(state, { type: "MARK_WRONG" });
  state = applyContestCommand(state, { type: "OPEN_ACTIVITY" });
  state = applyContestCommand(state, { type: "MARK_STEAL_CORRECT" });

  assert.equal(state.scores.team2, 5);
  assert.equal(state.scores.team1, 0);
  assert.equal(state.roundBank, 0);
  assert.equal(state.phase, "round_complete");
});

test("round multiplier is applied automatically", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s1" });
  state = applyContestCommand(state, { type: "MARK_CORRECT", points: 1 });
  state = applyContestCommand(state, { type: "END_ROUND" });
  state = applyContestCommand(state, { type: "START_ROUND" });
  state = applyContestCommand(state, { type: "ACCEPT_BUZZ", studentKey: "s3" });
  state = applyContestCommand(state, { type: "MARK_CORRECT", points: 6 });
  assert.equal(state.roundBank, 12);
});

test("round timeout blocks buzzes without changing score or bank", () => {
  let state = applyContestCommand(fresh(), { type: "START_ROUND" });
  const before = { scores: state.scores, bank: state.roundBank, strikes: state.strikes };
  state = applyContestCommand(state, { type: "ROUND_TIME_EXPIRED" });
  assert.deepEqual(getEligibleStudents(state), []);
  assert.deepEqual(state.scores, before.scores);
  assert.equal(state.roundBank, before.bank);
  assert.deepEqual(state.strikes, before.strikes);
});
