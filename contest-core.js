import { startTimer, pauseTimer, resumeTimer, adjustTimer, resetTimer } from "./contest-timers.js";

const VALID_STRIKE_LIMITS = new Set([1, 2, 3]);

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function assertPhase(state, phases, commandType) {
  if (!phases.includes(state.phase)) {
    throw new Error(`${commandType} is invalid during phase ${state.phase}.`);
  }
}

function teamById(state, teamId) {
  return state.config.teams.find((team) => team.id === teamId);
}

function otherTeamId(state, teamId) {
  return state.config.teams.find((team) => team.id !== teamId)?.id || null;
}

function activeRound(state) {
  return state.config.rounds[state.roundIndex] || null;
}

function activeActivityId(state) {
  return activeRound(state)?.activityIds?.[state.activityIndex] || null;
}

function activityPoints(state, command) {
  const multiplier = Number(activeRound(state)?.multiplier || 1);
  return Math.max(0, Number(command.points ?? 1)) * multiplier;
}

function appendEvent(state, type, detail = {}) {
  state.events.push({
    type,
    at: Number(detail.at ?? Date.now()),
    roundIndex: state.roundIndex,
    activityIndex: state.activityIndex,
    ...detail
  });
}

function rotateQueue(state, teamId, studentKey = null) {
  const queue = state.teamQueues[teamId] || [];
  if (!queue.length) return null;
  const selectedIndex = studentKey ? queue.indexOf(studentKey) : 0;
  if (selectedIndex < 0) throw new Error("Student is not in the team queue.");
  const [selected] = queue.splice(selectedIndex, 1);
  queue.push(selected);
  return selected;
}

function nextLeader(state, teamId) {
  const team = teamById(state, teamId);
  const students = team?.students || [];
  if (!students.length) return null;
  const used = new Set(state.leaderHistory[teamId] || []);
  let leader = (state.teamQueues[teamId] || []).find((studentKey) => !used.has(studentKey));
  if (!leader) {
    state.leaderHistory[teamId] = [];
    leader = state.teamQueues[teamId]?.[0] || students[0];
  }
  state.leaderHistory[teamId].push(leader);
  rotateQueue(state, teamId, leader);
  return leader;
}

function advanceActivity(state) {
  const round = activeRound(state);
  if (!round || state.activityIndex + 1 >= round.activityIds.length) {
    state.phase = "round_complete";
    state.activeStudentKey = null;
    state.eligibleStudentKeys = [];
    return false;
  }
  state.activityIndex += 1;
  state.activeStudentKey = null;
  state.buzzWinner = null;
  return true;
}

function settleRound(state, winningTeamId, eventType, command) {
  state.scores[winningTeamId] += state.roundBank;
  appendEvent(state, eventType, {
    teamId: winningTeamId,
    points: state.roundBank,
    at: command.at
  });
  state.roundBank = 0;
  state.phase = "round_complete";
  state.activeStudentKey = null;
  state.eligibleStudentKeys = [];
  state.buzzWinner = null;
}

export function createContestSession(config, random = Math.random) {
  if (!Array.isArray(config?.teams) || config.teams.length !== 2) {
    throw new Error("100 Students Said requires exactly two teams.");
  }
  if (!Array.isArray(config.rounds) || !config.rounds.length) {
    throw new Error("At least one round is required.");
  }
  const strikeLimit = Number(config.strikeLimit ?? 2);
  if (!VALID_STRIKE_LIMITS.has(strikeLimit)) {
    throw new Error("strikeLimit must be 1, 2, or 3.");
  }
  for (const team of config.teams) {
    if (!team.id || !Array.isArray(team.students) || !team.students.length) {
      throw new Error("Each team requires an id and at least one student.");
    }
  }

  const normalizedConfig = clone({ ...config, strikeLimit });
  return {
    contestId: normalizedConfig.contestId,
    phase: "lobby",
    roundIndex: -1,
    activityIndex: -1,
    controlTeamId: null,
    teamQueues: Object.fromEntries(normalizedConfig.teams.map((team) => [
      team.id,
      shuffle(team.students, random)
    ])),
    leaderHistory: Object.fromEntries(normalizedConfig.teams.map((team) => [team.id, []])),
    strikes: Object.fromEntries(normalizedConfig.teams.map((team) => [team.id, 0])),
    roundBank: 0,
    scores: Object.fromEntries(normalizedConfig.teams.map((team) => [team.id, 0])),
    activeStudentKey: null,
    activeLeaders: {},
    eligibleStudentKeys: [],
    attemptedStudentKeys: [],
    buzzWinner: null,
    revealedActivityIds: [],
    timers: { round: null, response: null },
    events: [],
    config: normalizedConfig
  };
}

export function getEligibleStudents(session) {
  if (session.roundTimeExpired) return [];
  const attempted = new Set(session.attemptedStudentKeys || []);
  if (session.phase === "faceoff") {
    return Object.values(session.activeLeaders || {}).filter(Boolean).filter((key) => !attempted.has(key));
  }
  if (session.phase === "control") {
    return session.activeStudentKey ? [session.activeStudentKey] : [];
  }
  if (session.phase === "steal") {
    return session.activeStudentKey ? [session.activeStudentKey] : [];
  }
  return [];
}

const COMMAND_HANDLERS = {
  START_ROUND(state, command) {
    assertPhase(state, ["lobby", "round_complete"], command.type);
    const nextRoundIndex = command.roundIndex ?? state.roundIndex + 1;
    if (!state.config.rounds[nextRoundIndex]) throw new Error("Round does not exist.");
    state.roundIndex = nextRoundIndex;
    state.activityIndex = 0;
    state.controlTeamId = null;
    state.roundBank = 0;
    state.buzzWinner = null;
    state.attemptedStudentKeys = [];
    state.roundTimeExpired = false;
    const roundDurationMs = Number(command.roundDurationMs ?? state.config.roundDurationMs ?? 300000);
    const responseDurationMs = Number(command.responseDurationMs ?? state.config.responseDurationMs ?? 10000);
    state.timers.round = startTimer(roundDurationMs, command.at ?? Date.now());
    state.timers.response = resetTimer(responseDurationMs);
    for (const team of state.config.teams) state.strikes[team.id] = 0;
    state.activeLeaders = Object.fromEntries(
      state.config.teams.map((team) => [team.id, nextLeader(state, team.id)])
    );
    state.phase = "faceoff";
    state.eligibleStudentKeys = getEligibleStudents(state);
    appendEvent(state, "ROUND_STARTED", { at: command.at });
    return state;
  },

  ACCEPT_BUZZ(state, command) {
    assertPhase(state, ["faceoff"], command.type);
    const eligible = getEligibleStudents(state);
    if (!eligible.includes(command.studentKey)) throw new Error("Student is not eligible to buzz.");
    const teamId = state.config.teams.find((team) => team.students.includes(command.studentKey))?.id;
    state.buzzWinner = { studentKey: command.studentKey, teamId, at: command.at ?? Date.now() };
    state.attemptedStudentKeys.push(command.studentKey);
    state.phase = "faceoff_answer";
    state.eligibleStudentKeys = [];
    appendEvent(state, "BUZZ_ACCEPTED", { studentKey: command.studentKey, teamId, at: command.at });
    return state;
  },

  MARK_CORRECT(state, command) {
    if (state.phase === "faceoff_answer") {
      const teamId = state.buzzWinner?.teamId;
      if (!teamId) throw new Error("No face-off buzz winner.");
      state.controlTeamId = teamId;
      state.roundBank += activityPoints(state, command);
      appendEvent(state, "CONTROL_WON", { teamId, studentKey: state.buzzWinner.studentKey, at: command.at });
      if (advanceActivity(state)) {
        state.phase = "control_ready";
      } else {
        settleRound(state, teamId, "ROUND_COMPLETED", command);
      }
      return state;
    }
    assertPhase(state, ["control"], command.type);
    state.roundBank += activityPoints(state, command);
    appendEvent(state, "ANSWER_CORRECT", {
      teamId: state.controlTeamId,
      studentKey: state.activeStudentKey,
      at: command.at
    });
    rotateQueue(state, state.controlTeamId, state.activeStudentKey);
    if (advanceActivity(state)) {
      state.phase = "control_ready";
    } else {
      settleRound(state, state.controlTeamId, "ROUND_COMPLETED", command);
    }
    return state;
  },

  MARK_WRONG(state, command) {
    if (state.phase === "faceoff_answer") {
      appendEvent(state, "FACEOFF_WRONG", {
        studentKey: state.buzzWinner?.studentKey,
        teamId: state.buzzWinner?.teamId,
        at: command.at
      });
      state.buzzWinner = null;
      state.phase = "faceoff";
      state.eligibleStudentKeys = getEligibleStudents(state);
      if (!state.eligibleStudentKeys.length) {
        state.activeLeaders = Object.fromEntries(
          state.config.teams.map((team) => [team.id, nextLeader(state, team.id)])
        );
        state.attemptedStudentKeys = [];
        state.eligibleStudentKeys = getEligibleStudents(state);
        appendEvent(state, "FACEOFF_LEADERS_ROTATED", { at: command.at });
      }
      return state;
    }

    assertPhase(state, ["control"], command.type);
    const teamId = state.controlTeamId;
    state.strikes[teamId] += 1;
    appendEvent(state, "ANSWER_WRONG", {
      teamId,
      studentKey: state.activeStudentKey,
      strikes: state.strikes[teamId],
      at: command.at
    });
    rotateQueue(state, teamId, state.activeStudentKey);
    if (state.strikes[teamId] >= state.config.strikeLimit) {
      const stealTeamId = otherTeamId(state, teamId);
      state.phase = "steal_ready";
      state.activeStudentKey = null;
      state.stealTeamId = stealTeamId;
    } else {
      if (advanceActivity(state)) {
        state.phase = "control_ready";
      } else {
        settleRound(state, teamId, "ROUND_COMPLETED", command);
      }
    }
    return state;
  },

  OPEN_ACTIVITY(state, command) {
    assertPhase(state, ["control_ready", "steal_ready"], command.type);
    const teamId = state.phase === "steal_ready" ? state.stealTeamId : state.controlTeamId;
    const requested = command.studentKey || state.teamQueues[teamId]?.[0];
    if (!teamById(state, teamId)?.students.includes(requested)) {
      throw new Error("Assigned student is not on the active team.");
    }
    state.activeStudentKey = requested;
    state.timers.response = startTimer(
      Number(command.responseDurationMs ?? state.config.responseDurationMs ?? 10000),
      command.at ?? Date.now()
    );
    state.phase = state.phase === "steal_ready" ? "steal" : "control";
    state.eligibleStudentKeys = [requested];
    appendEvent(state, "ACTIVITY_OPENED", {
      activityId: activeActivityId(state),
      teamId,
      studentKey: requested,
      at: command.at
    });
    return state;
  },

  MARK_STEAL_CORRECT(state, command) {
    assertPhase(state, ["steal"], command.type);
    settleRound(state, state.stealTeamId, "STEAL_CORRECT", command);
    return state;
  },

  MARK_STEAL_WRONG(state, command) {
    assertPhase(state, ["steal"], command.type);
    settleRound(state, state.controlTeamId, "STEAL_WRONG", command);
    return state;
  },

  REVEAL_MODEL(state, command) {
    const activityId = activeActivityId(state);
    if (activityId && !state.revealedActivityIds.includes(activityId)) {
      state.revealedActivityIds.push(activityId);
    }
    appendEvent(state, "MODEL_REVEALED", { activityId, at: command.at });
    return state;
  },

  ROUND_TIME_EXPIRED(state, command) {
    state.roundTimeExpired = true;
    state.eligibleStudentKeys = [];
    appendEvent(state, "ROUND_TIME_EXPIRED", { at: command.at });
    return state;
  },

  ADD_ROUND_TIME(state, command) {
    state.roundTimeExpired = false;
    state.eligibleStudentKeys = getEligibleStudents(state);
    appendEvent(state, "ROUND_TIME_ADDED", { deltaMs: Number(command.deltaMs || 0), at: command.at });
    return state;
  },

  PAUSE_ROUND_TIMER(state, command) {
    state.timers.round = pauseTimer(state.timers.round, command.at ?? Date.now());
    appendEvent(state, "ROUND_TIMER_PAUSED", { at: command.at });
    return state;
  },

  RESUME_ROUND_TIMER(state, command) {
    state.timers.round = resumeTimer(state.timers.round, command.at ?? Date.now());
    appendEvent(state, "ROUND_TIMER_RESUMED", { at: command.at });
    return state;
  },

  ADJUST_ROUND_TIMER(state, command) {
    state.timers.round = adjustTimer(
      state.timers.round,
      Number(command.deltaMs || 0),
      command.at ?? Date.now()
    );
    if (Number(command.deltaMs || 0) > 0) state.roundTimeExpired = false;
    appendEvent(state, "ROUND_TIMER_ADJUSTED", { deltaMs: Number(command.deltaMs || 0), at: command.at });
    return state;
  },

  RESET_RESPONSE_TIMER(state, command) {
    state.timers.response = startTimer(
      Number(command.durationMs ?? state.config.responseDurationMs ?? 10000),
      command.at ?? Date.now()
    );
    appendEvent(state, "RESPONSE_TIMER_RESET", { at: command.at });
    return state;
  },

  END_ROUND(state, command) {
    if (!state.controlTeamId) throw new Error("No team controls the round.");
    settleRound(state, state.controlTeamId, "ROUND_ENDED", command);
    return state;
  }
};

export function applyContestCommand(session, command) {
  const handler = COMMAND_HANDLERS[command?.type];
  if (!handler) throw new Error(`Unknown contest command: ${command?.type}`);
  return handler(clone(session), command);
}
