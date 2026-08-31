import test from "node:test";
import assert from "node:assert/strict";
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  adjustTimer,
  remainingMs,
  resetTimer,
  isTimerExpired
} from "../contest-timers.js";

test("round timer recovers from timestamps after refresh", () => {
  const timer = startTimer(60_000, 1_000);
  assert.equal(remainingMs(timer, 21_000), 40_000);
});

test("pausing one timer does not pause the other", () => {
  const round = startTimer(60_000, 0);
  const response = pauseTimer(startTimer(10_000, 0), 2_000);
  assert.equal(remainingMs(round, 5_000), 55_000);
  assert.equal(remainingMs(response, 5_000), 8_000);
});

test("resume excludes time spent paused", () => {
  let timer = startTimer(10_000, 0);
  timer = pauseTimer(timer, 2_000);
  timer = resumeTimer(timer, 7_000);
  assert.equal(remainingMs(timer, 8_000), 7_000);
});

test("adjust supports positive and negative values while running", () => {
  let timer = startTimer(60_000, 0);
  timer = adjustTimer(timer, 10_000, 20_000);
  assert.equal(remainingMs(timer, 20_000), 50_000);
  timer = adjustTimer(timer, -60_000, 20_000);
  assert.equal(remainingMs(timer, 20_000), 0);
});

test("adjust preserves paused state", () => {
  let timer = pauseTimer(startTimer(10_000, 0), 2_000);
  timer = adjustTimer(timer, 5_000, 9_000);
  assert.equal(timer.status, "paused");
  assert.equal(remainingMs(timer, 30_000), 13_000);
});

test("remaining time is clamped and expiry has no scoring side effects", () => {
  const scoreState = { score: 8, bank: 4, strikes: 1 };
  const timer = startTimer(1_000, 0);
  assert.equal(remainingMs(timer, 5_000), 0);
  assert.equal(isTimerExpired(timer, 5_000), true);
  assert.deepEqual(scoreState, { score: 8, bank: 4, strikes: 1 });
});

test("reset timer is idle at its full duration", () => {
  const timer = resetTimer(10_000);
  assert.equal(timer.status, "idle");
  assert.equal(remainingMs(timer, 90_000), 10_000);
});
