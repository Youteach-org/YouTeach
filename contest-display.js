import { remainingMs } from "./contest-timers.js";
import { getActivityById } from "./contest-seed.js";

function currentRound(session, contest) {
  return contest.rounds?.[session.roundIndex] || null;
}

function currentActivity(session, contest) {
  const round = currentRound(session, contest);
  if (!round) return null;
  const configuredId = session.config?.rounds?.[session.roundIndex]?.activityIds?.[session.activityIndex];
  return configuredId
    ? getActivityById(contest, configuredId)
    : round.activities?.[session.activityIndex] || null;
}

function timerProjection(timer, nowMs) {
  if (!timer) return null;
  return {
    status: timer.status,
    durationMs: Number(timer.durationMs || 0),
    remainingMs: remainingMs(timer, nowMs)
  };
}

function teamName(session, teamId) {
  return session.config?.teams?.find((team) => team.id === teamId)?.name || teamId || "";
}

function publicFeedback(session, activity) {
  const events = session.events || [];
  const latest = events[events.length - 1] || null;
  const feedback = latest && [
    "ANSWER_CORRECT",
    "ANSWER_WRONG",
    "FACEOFF_WRONG",
    "CONTROL_WON",
    "STEAL_CORRECT",
    "STEAL_WRONG",
    "ROUND_TIME_EXPIRED"
  ].includes(latest.type)
    ? { type: latest.type, teamId: latest.teamId || null }
    : null;

  const revealed = Boolean(
    activity && (session.revealedActivityIds || []).includes(activity.id)
  );

  return {
    feedback,
    revealedModel: revealed ? activity.modelAnswer : null
  };
}

export function buildPublicDisplay(session, contest, nowMs = Date.now()) {
  const round = currentRound(session, contest);
  const activity = currentActivity(session, contest);
  const teams = (session.config?.teams || []).map((team) => ({
    id: team.id,
    name: team.name || team.id,
    score: Number(session.scores?.[team.id] || 0),
    strikes: Number(session.strikes?.[team.id] || 0)
  }));
  const safeFeedback = publicFeedback(session, activity);

  return {
    contestId: session.contestId,
    title: contest.title,
    topic: contest.topic,
    phase: session.phase,
    round: round ? {
      index: session.roundIndex,
      number: session.roundIndex + 1,
      title: round.title,
      multiplier: Number(round.multiplier || 1)
    } : null,
    activity: activity ? {
      id: activity.id,
      prompt: activity.prompt,
      progress: session.activityIndex + 1,
      total: round.activities?.length || 0,
      revealedModel: safeFeedback.revealedModel
    } : null,
    teams,
    controlTeam: session.controlTeamId
      ? { id: session.controlTeamId, name: teamName(session, session.controlTeamId) }
      : null,
    activeStudentKey: session.activeStudentKey,
    activeLeaderKeys: Object.values(session.activeLeaders || {}).filter(Boolean),
    buzzWinner: session.buzzWinner ? {
      studentKey: session.buzzWinner.studentKey,
      teamId: session.buzzWinner.teamId
    } : null,
    bank: Number(session.roundBank || 0),
    strikeLimit: Number(session.config?.strikeLimit || 2),
    feedback: safeFeedback.feedback,
    roundTimer: timerProjection(session.timers?.round, nowMs),
    responseTimer: timerProjection(session.timers?.response, nowMs),
    roundTimeExpired: Boolean(session.roundTimeExpired)
  };
}

export function buildTeacherGuide(session, contest, nowMs = Date.now()) {
  const publicDisplay = buildPublicDisplay(session, contest, nowMs);
  const activity = currentActivity(session, contest);

  return {
    ...publicDisplay,
    eligibleStudentKeys: [...(session.eligibleStudentKeys || [])],
    teamQueues: Object.fromEntries(
      Object.entries(session.teamQueues || {}).map(([teamId, queue]) => [teamId, [...queue]])
    ),
    attemptedStudentKeys: [...(session.attemptedStudentKeys || [])],
    teacherGuide: activity ? {
      modelAnswer: activity.modelAnswer,
      acceptedAlternatives: [...(activity.acceptedAlternatives || [])],
      explanation: activity.explanation || "",
      teacherNotes: activity.teacherNotes || "",
      reportingFunction: activity.reportingFunction || "",
      difficulty: activity.difficulty || "",
      basePoints: Number(activity.basePoints || 0),
      studyReference: activity.studyReference || ""
    } : null
  };
}
