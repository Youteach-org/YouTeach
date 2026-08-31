function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) throw new Error("Timer duration must be a finite number.");
  return Math.max(0, duration);
}

export function startTimer(durationMs, nowMs = Date.now()) {
  return {
    durationMs: normalizeDuration(durationMs),
    startedAt: Number(nowMs),
    pausedAt: null,
    accumulatedPauseMs: 0,
    status: "running"
  };
}

export function remainingMs(timer, nowMs = Date.now()) {
  if (!timer) return 0;
  const duration = normalizeDuration(timer.durationMs);
  if (timer.status === "idle") return duration;
  const effectiveNow = timer.status === "paused"
    ? Number(timer.pausedAt)
    : Number(nowMs);
  const elapsed = Math.max(
    0,
    effectiveNow - Number(timer.startedAt) - Number(timer.accumulatedPauseMs || 0)
  );
  return Math.max(0, duration - elapsed);
}

export function pauseTimer(timer, nowMs = Date.now()) {
  if (!timer || timer.status !== "running") return timer ? { ...timer } : null;
  return {
    ...timer,
    pausedAt: Number(nowMs),
    status: "paused"
  };
}

export function resumeTimer(timer, nowMs = Date.now()) {
  if (!timer || timer.status !== "paused") return timer ? { ...timer } : null;
  const pauseLength = Math.max(0, Number(nowMs) - Number(timer.pausedAt));
  return {
    ...timer,
    pausedAt: null,
    accumulatedPauseMs: Number(timer.accumulatedPauseMs || 0) + pauseLength,
    status: "running"
  };
}

export function adjustTimer(timer, deltaMs, nowMs = Date.now()) {
  if (!timer) throw new Error("Timer is required.");
  const remaining = remainingMs(timer, nowMs);
  const adjustedRemaining = Math.max(0, remaining + Number(deltaMs || 0));
  const status = timer.status;
  if (status === "paused") {
    return {
      durationMs: adjustedRemaining,
      startedAt: Number(nowMs),
      pausedAt: Number(nowMs),
      accumulatedPauseMs: 0,
      status: "paused"
    };
  }
  if (status === "idle") {
    return {
      ...timer,
      durationMs: adjustedRemaining
    };
  }
  return {
    durationMs: adjustedRemaining,
    startedAt: Number(nowMs),
    pausedAt: null,
    accumulatedPauseMs: 0,
    status: "running"
  };
}

export function resetTimer(durationMs) {
  return {
    durationMs: normalizeDuration(durationMs),
    startedAt: null,
    pausedAt: null,
    accumulatedPauseMs: 0,
    status: "idle"
  };
}

export function isTimerExpired(timer, nowMs = Date.now()) {
  return Boolean(timer && timer.status !== "idle" && remainingMs(timer, nowMs) === 0);
}
