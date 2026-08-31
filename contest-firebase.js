import { db } from "./firebase.js";
import {
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { createContestSession, applyContestCommand, getEligibleStudents } from "./contest-core.js";
import { buildPublicDisplay, buildTeacherGuide } from "./contest-display.js";

const ROOT = "contests";

export const contestPaths = {
  definition: (contestId) => `${ROOT}/definitions/${contestId}`,
  session: (sessionId) => `${ROOT}/sessions/${sessionId}`,
  privateState: (sessionId) => `${ROOT}/sessions/${sessionId}/private/state`,
  publicState: (sessionId) => `${ROOT}/sessions/${sessionId}/public`,
  student: (sessionId, studentKey) => `${ROOT}/sessions/${sessionId}/students/${studentKey}`,
  buzzLock: (sessionId) => `${ROOT}/sessions/${sessionId}/buzzLock`,
  pairing: (code) => `${ROOT}/pairing/${code}`
};

function studentEligibilityRecords(state) {
  const eligible = new Set(getEligibleStudents(state));
  const records = {};
  for (const team of state.config.teams) {
    team.students.forEach((studentKey, position) => {
      records[studentKey] = {
        studentKey,
        teamId: team.id,
        position: position + 1,
        eligible: eligible.has(studentKey),
        phase: state.phase,
        active: state.activeStudentKey === studentKey,
        updatedAt: Date.now()
      };
    });
  }
  return records;
}

export async function createLiveContest({
  sessionId,
  contest,
  config,
  pairingCode,
  nowMs = Date.now()
}) {
  if (!sessionId || !contest?.id) throw new Error("sessionId and contest are required.");
  const state = createContestSession(config);
  const updates = {
    [contestPaths.definition(contest.id)]: contest,
    [contestPaths.privateState(sessionId)]: state,
    [contestPaths.publicState(sessionId)]: buildPublicDisplay(state, contest, nowMs),
    [`${contestPaths.session(sessionId)}/students`]: studentEligibilityRecords(state),
    [`${contestPaths.session(sessionId)}/meta`]: {
      contestId: contest.id,
      sessionId,
      createdAt: nowMs,
      status: "active"
    },
    [contestPaths.buzzLock(sessionId)]: null
  };
  if (pairingCode) {
    updates[contestPaths.pairing(String(pairingCode).toUpperCase())] = {
      sessionId,
      createdAt: nowMs,
      status: "active"
    };
  }
  await update(ref(db), updates);
  return state;
}

export function subscribeTeacherContest(sessionId, listener) {
  return onValue(ref(db, contestPaths.session(sessionId)), async (snapshot) => {
    const value = snapshot.val();
    if (!value) return listener(null);
    const contestId = value.meta?.contestId;
    const definitionSnapshot = contestId
      ? await get(ref(db, contestPaths.definition(contestId)))
      : null;
    const contest = definitionSnapshot?.val() || null;
    const state = value.private?.state || null;
    listener({
      ...value,
      definition: contest,
      teacherGuide: state && contest ? buildTeacherGuide(state, contest, Date.now()) : null
    });
  });
}

export function subscribePublicContest(sessionId, listener) {
  return onValue(ref(db, contestPaths.publicState(sessionId)), (snapshot) => {
    listener(snapshot.val() || null);
  });
}

export function subscribeStudentContest(sessionId, studentKey, listener) {
  let publicState = null;
  let eligibility = null;
  const emit = () => listener({ public: publicState, eligibility });
  const unsubscribePublic = onValue(
    ref(db, contestPaths.publicState(sessionId)),
    (snapshot) => {
      publicState = snapshot.val() || null;
      emit();
    }
  );
  const unsubscribeStudent = onValue(
    ref(db, contestPaths.student(sessionId, studentKey)),
    (snapshot) => {
      eligibility = snapshot.val() || null;
      emit();
    }
  );
  return () => {
    unsubscribePublic();
    unsubscribeStudent();
  };
}

export async function sendTeacherCommand(sessionId, command, nowMs = Date.now()) {
  const metaSnapshot = await get(ref(db, `${contestPaths.session(sessionId)}/meta`));
  const contestId = metaSnapshot.val()?.contestId;
  if (!contestId) throw new Error("Contest session not found.");
  const definitionSnapshot = await get(ref(db, contestPaths.definition(contestId)));
  const contest = definitionSnapshot.val();
  if (!contest) throw new Error("Contest definition not found.");

  let nextState = null;
  const result = await runTransaction(
    ref(db, contestPaths.privateState(sessionId)),
    (currentState) => {
      if (!currentState) return currentState;
      nextState = applyContestCommand(currentState, { ...command, at: command.at ?? nowMs });
      return nextState;
    },
    { applyLocally: false }
  );

  if (!result.committed || !nextState) {
    throw new Error("Teacher command was not committed.");
  }

  const updates = {
    [contestPaths.publicState(sessionId)]: buildPublicDisplay(nextState, contest, nowMs),
    [`${contestPaths.session(sessionId)}/students`]: studentEligibilityRecords(nextState)
  };
  if (command.type === "START_ROUND" || command.type === "OPEN_ACTIVITY") {
    updates[contestPaths.buzzLock(sessionId)] = null;
  }
  await update(ref(db), updates);
  return nextState;
}

export async function submitContestBuzz(sessionId, {
  studentKey,
  teamId,
  studentName = "",
  at = Date.now()
}) {
  if (!studentKey) throw new Error("studentKey is required.");
  const eligibilitySnapshot = await get(
    ref(db, contestPaths.student(sessionId, studentKey))
  );
  const eligibility = eligibilitySnapshot.val();
  if (!eligibility?.eligible) {
    return { accepted: false, reason: "not-eligible" };
  }

  const result = await runTransaction(
    ref(db, contestPaths.buzzLock(sessionId)),
    (current) => current || {
      studentKey,
      teamId: teamId || eligibility.teamId,
      studentName,
      at,
      phase: eligibility.phase
    },
    { applyLocally: false }
  );

  const winner = result.snapshot.val();
  return {
    accepted: Boolean(result.committed && winner?.studentKey === studentKey),
    winner
  };
}

export async function clearContestBuzz(sessionId) {
  await set(ref(db, contestPaths.buzzLock(sessionId)), null);
}

export async function pairPublicBoard(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) throw new Error("Pairing code is required.");
  const snapshot = await get(ref(db, contestPaths.pairing(normalized)));
  const pairing = snapshot.val();
  if (!pairing?.sessionId || pairing.status !== "active") {
    throw new Error("Pairing code is invalid or inactive.");
  }
  return pairing.sessionId;
}
