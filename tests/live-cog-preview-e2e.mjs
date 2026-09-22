import assert from "node:assert/strict";
import { chromium } from "playwright";

const YT = (process.env.YT_PREVIEW || "https://feature-live-cog-firebase-cu.youteach.pages.dev").replace(/\/$/, "");
const COG = (process.env.COG_PREVIEW || "https://feature-live-cog-firebase-cu.classroom-online-games.pages.dev").replace(/\/$/, "");
const DB = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const GROUP = "FANTASMA";
const GHOST_ID = "GHOST20";
const TIMEZONE = "America/Mexico_City";
const marker = Date.now();
const title = `E2E Verb Runner ${marker}`;
const resultId = `e2e_vr_${marker}`;

let browser, teacherContext, studentContext, teacherPage, cogTeacherPage, studentPage;
let assignmentId = "", cogSessionId = "", ghostKey = "";
let ghostBefore = null, attendanceBefore = null, sessionBefore = null;
let sessionMutated = false;

const urlFor = (path) => `${DB}/${String(path).replace(/^\/+|\/+$/g, "")}.json`;

async function fb(path, method = "GET", body) {
  const response = await fetch(urlFor(path), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Firebase ${method} ${path}: ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function waitFor(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function today() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function tomorrowLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(Date.now() + 86400000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

async function findAssignment() {
  const all = await fb("assignments");
  const found = Object.entries(all || {}).find(([, a]) => a?.title === title);
  return found ? { id: found[0], value: found[1] } : null;
}

async function cleanup() {
  if (!assignmentId) assignmentId = (await findAssignment().catch(() => null))?.id || "";
  if (cogSessionId && ghostKey) {
    await fb(`classroomGameResults/${cogSessionId}/${ghostKey}/${resultId}`, "DELETE").catch(() => {});
  }
  if (assignmentId && ghostKey) {
    await fb(`classroomGameResultsByAssignment/${assignmentId}/${ghostKey}/${resultId}`, "DELETE").catch(() => {});
  }
  if (cogSessionId) await fb(`classroomGames/verbRunnerV2/sessions/${cogSessionId}`, "DELETE").catch(() => {});
  if (assignmentId) await fb(`assignments/${assignmentId}`, "DELETE").catch(() => {});

  if (sessionMutated) {
    if (sessionBefore == null) await fb("session/current", "DELETE").catch(() => {});
    else await fb("session/current", "PUT", sessionBefore).catch(() => {});
  }

  if (ghostKey && ghostBefore) {
    await fb(`students/${ghostKey}`, "PATCH", {
      activeNow: Object.hasOwn(ghostBefore, "activeNow") ? ghostBefore.activeNow : null,
      lastSeenAt: Object.hasOwn(ghostBefore, "lastSeenAt") ? ghostBefore.lastSeenAt : null
    }).catch(() => {});
    const attendancePath = `attendance/${today()}/${ghostKey}`;
    if (attendanceBefore == null) await fb(attendancePath, "DELETE").catch(() => {});
    else await fb(attendancePath, "PUT", attendanceBefore).catch(() => {});
  }

  await studentContext?.close().catch(() => {});
  await teacherContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

async function fillDeployedTeacherCredential(page) {
  await page.locator("#username").fill("teacher");
  await page.evaluate(async () => {
    const source = await fetch("teacher-login.js").then((r) => r.text());
    const match = source.match(/username:\s*"teacher"\s*,\s*password:\s*"([^"]+)"/);
    if (!match) throw new Error("Teacher test credential not found in deployed login source.");
    const input = document.querySelector("#password");
    input.value = match[1];
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function main() {
  sessionBefore = await fb("session/current");

  const students = await fb("students");
  const ghost = Object.entries(students || {}).find(([, s]) =>
    String(s?.studentNumber || s?.id || "") === GHOST_ID && String(s?.groupName || "") === GROUP
  );
  assert.ok(ghost, "Existing Ghost lab student GHOST20 is required; this test will not create students.");
  [ghostKey, ghostBefore] = ghost;
  assert.equal(String(ghostBefore.nickname || ""), "FAKE-20");
  attendanceBefore = await fb(`attendance/${today()}/${ghostKey}`);

  browser = await chromium.launch({ headless: true });
  teacherContext = await browser.newContext({ timezoneId: TIMEZONE });
  studentContext = await browser.newContext({ timezoneId: TIMEZONE });
  teacherPage = await teacherContext.newPage();
  studentPage = await studentContext.newPage();

  console.log("E2E teacher: login → FANTASMA → Smart Teams");
  await teacherPage.goto(`${YT}/teacher-login.html`, { waitUntil: "domcontentloaded" });
  await fillDeployedTeacherCredential(teacherPage);
  await teacherPage.locator("#loginBtn").click();
  await teacherPage.locator("#workingGroupStep").waitFor({ state: "visible", timeout: 15000 });
  await teacherPage.locator("#workingGroupSelect").selectOption({ label: GROUP });
  await teacherPage.locator("#continueWithGroupBtn").click();
  await teacherPage.waitForURL((u) => u.origin === YT && (u.pathname === "/buzzer" || u.pathname.endsWith("/buzzer.html")), { timeout: 15000 });

  sessionBefore = await fb("session/current");
  const hasOccupiedSession = sessionBefore?.active === true || sessionBefore?.connectedGame?.status === "active";
  const isRestorableIdleGhostLab =
    sessionBefore?.active === true &&
    String(sessionBefore?.groupName || "") === GROUP &&
    sessionBefore?.connectedGame?.status !== "active" &&
    sessionBefore?.buzzer?.roundOpen !== true &&
    !sessionBefore?.buzzer?.currentBuzz;

  if (hasOccupiedSession && !isRestorableIdleGhostLab) {
    console.log("E2E_BLOCKED session/current summary", JSON.stringify({
      groupName: String(sessionBefore?.groupName || sessionBefore?.connectedGame?.groupName || ""),
      active: Boolean(sessionBefore?.active),
      createdAt: Number(sessionBefore?.createdAt || 0),
      roundOpen: Boolean(sessionBefore?.buzzer?.roundOpen),
      hasCurrentBuzz: Boolean(sessionBefore?.buzzer?.currentBuzz),
      connectedGameStatus: String(sessionBefore?.connectedGame?.status || ""),
      connectedGameId: String(sessionBefore?.connectedGame?.gameId || "")
    }));
    throw new Error("E2E_BLOCKED: a non-restorable active session occupies session/current; no writes performed.");
  }

  if (isRestorableIdleGhostLab) {
    console.log("E2E: preserving idle FANTASMA session and restoring it after the smoke.");
  }

  await teacherPage.locator("#groupSelect").selectOption({ label: GROUP });
  await teacherPage.locator("#teamSourceSelect").selectOption("all");
  await teacherPage.locator("#numTeams").fill("2");
  teacherPage.once("dialog", (d) => d.accept());
  sessionMutated = true;
  await teacherPage.locator("#createTeams").click();
  await waitFor(() => teacherPage.locator("#openAssignmentsModuleBtn").isEnabled(), "Assignments enable");

  console.log("E2E teacher: create COG assignment and consume teacher launch");
  await teacherPage.locator("#openAssignmentsModuleBtn").click();
  const frame = await waitFor(
    () => teacherPage.frames().find((f) => {
      try {
        const url = new URL(f.url());
        return url.origin === YT && (url.pathname === "/assignment-create-module" || url.pathname.endsWith("/assignment-create-module.html"));
      } catch {
        return false;
      }
    }),
    "Assignments iframe"
  );
  await frame.locator("#assignmentType").selectOption("COG");
  await frame.locator("#assignmentTitle").fill(title);
  await frame.locator("#assignmentDueAt").fill(tomorrowLocal());
  await frame.locator("#assignmentInstructions").fill("Automated preview smoke test.");
  assert.equal(await frame.locator("#assignmentGroup").inputValue(), GROUP);
  await frame.waitForFunction(() => Boolean(document.querySelector("#assignmentCode")?.value?.trim()));

  const popupPromise = teacherContext.waitForEvent("page");
  await frame.locator("#createAssignmentBtn").click();
  cogTeacherPage = await popupPromise;
  await cogTeacherPage.waitForURL((u) => u.origin === COG && u.pathname.startsWith("/teacher/"), { timeout: 30000 });
  await waitFor(
    async () => (await cogTeacherPage.locator("#gameGateMessage").textContent())?.includes("YouTeach connected"),
    "verified COG teacher context"
  );
  assert.match(await cogTeacherPage.locator("#gameGateMessage").textContent(), /FANTASMA/);

  const assignment = await waitFor(findAssignment, "COG assignment in Firebase");
  assignmentId = assignment.id;
  assert.equal(assignment.value.assignmentTypeCode, "COG");
  assert.ok(assignment.value.recipientStudentKeys?.includes(ghostKey));

  await cogTeacherPage.locator('a[href="/Verb-Runner/teacher/"]').click();
  await cogTeacherPage.waitForURL((u) => u.origin === COG && u.pathname.startsWith("/Verb-Runner/teacher/"), { timeout: 15000 });
  await cogTeacherPage.locator("#settingsToggle").click();
  await cogTeacherPage.locator("#challengeCount").fill("5");

  console.log("E2E student: existing Ghost login; no game before CREATE SESSION");
  await studentPage.goto(`${YT}/student.html`, { waitUntil: "domcontentloaded" });
  await studentPage.locator("#studentId").fill(GHOST_ID);
  await studentPage.locator("#studentPassword").fill("1234");
  await studentPage.locator("#studentLoginBtn").click();
  await studentPage.waitForURL((u) => u.origin === YT && (u.pathname === "/student-buzzer" || u.pathname.endsWith("/student-buzzer.html")), { timeout: 20000 });
  assert.equal(await studentPage.locator("#liveGameCard").isHidden(), true);

  console.log("E2E teacher: CREATE SESSION → canonical connectedGame");
  await cogTeacherPage.locator("#createSession").click();
  await waitFor(
    async () => (await cogTeacherPage.locator("#teacherNotice").textContent())?.includes("created for YouTeach group " + GROUP),
    "Verb Runner session creation"
  );
  const game = await waitFor(async () => {
    const current = await fb("session/current");
    return current?.connectedGame?.status === "active" &&
      current.connectedGame.gameId === "verb-runner" &&
      current.connectedGame.assignmentId === assignmentId
      ? current.connectedGame : null;
  }, "session/current.connectedGame");
  cogSessionId = String(game.cogSessionId || "");
  assert.ok(cogSessionId);

  console.log("E2E student: JOIN GAME → signed canonical Ghost context");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const studentAccessDiagnostic = await studentPage.evaluate(async ({ connectedGame, ghostKey, group }) => {
    const policy = await import("/cog-live-session-policy.mjs");
    return {
      url: location.href,
      localStudentKey: localStorage.getItem("youteachStudentKey") || "",
      localExternalId: localStorage.getItem("youteachStudentExternalId") || "",
      cardHidden: document.querySelector("#liveGameCard")?.hidden,
      cardDisplay: getComputedStyle(document.querySelector("#liveGameCard")).display,
      studentName: document.querySelector("#studentName")?.textContent || "",
      studentTeam: document.querySelector("#studentTeam")?.textContent || "",
      studentStatus: document.querySelector("#studentStatus")?.textContent || "",
      policyAllowsExpectedIdentity: policy.canStudentAccessLiveGame({
        connectedGame,
        studentGroup: group,
        studentKey: ghostKey,
        now: Date.now()
      }),
      connectedGameGroup: connectedGame?.groupName || "",
      connectedGameStatus: connectedGame?.status || "",
      connectedGameRecipients: connectedGame?.recipientStudentKeys || []
    };
  }, { connectedGame: game, ghostKey, group: GROUP });
  console.log("E2E diagnostic Student Buzzer access", JSON.stringify(studentAccessDiagnostic));
  await studentPage.locator("#liveGameCard").waitFor({ state: "visible", timeout: 30000 });
  assert.equal((await studentPage.locator("#liveGameName").textContent())?.trim(), "Verb Runner");
  await studentPage.locator("#joinLiveGameBtn").click();
  await studentPage.waitForURL((u) => u.origin === COG && u.pathname.startsWith("/Verb-Runner/"), { timeout: 30000 });
  await studentPage.waitForFunction(
    () => Boolean(sessionStorage.getItem("cogYouTeachLiveStudentContext")),
    null,
    { timeout: 60000 }
  );
  const live = await studentPage.evaluate(() =>
    JSON.parse(sessionStorage.getItem("cogYouTeachLiveStudentContext") || "null")
  );
  assert.equal(live.identity.studentKey, ghostKey);
  assert.equal(live.identity.nickname, "FAKE-20");
  assert.equal(live.identity.studentNumber, GHOST_ID);
  assert.equal(live.identity.groupName, GROUP);
  assert.equal(live.liveContext.cogSessionId, cogSessionId);
  assert.equal(live.liveContext.assignmentId, assignmentId);

  console.log("E2E bridge: heartbeat + idempotent receipt");
  const heartbeat = await studentPage.evaluate(async () => {
    const c = JSON.parse(sessionStorage.getItem("cogYouTeachLiveStudentContext"));
    const r = await fetch(c.issuer + "/api/cog-live-heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.bridgeToken },
      body: JSON.stringify({ role: "student", cogSessionId: c.liveContext.cogSessionId })
    });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.ok, true);

  const result = {
    schemaVersion: 1,
    resultId,
    attemptId: `attempt_${marker}`,
    resultType: "individual",
    completedAt: Date.now(),
    percentage: 88,
    points: null,
    metrics: { correct: 4, errors: 1, bestStreak: 3, timeMs: 5000, mode: "preview-e2e-bridge", difficulty: "easy" }
  };
  const submit = () => studentPage.evaluate(async (result) => {
    const c = JSON.parse(sessionStorage.getItem("cogYouTeachLiveStudentContext"));
    const r = await fetch(c.issuer + "/api/cog-live-result-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.bridgeToken },
      body: JSON.stringify({ result })
    });
    return { status: r.status, body: await r.json() };
  }, result);

  const first = await submit();
  assert.equal(first.status, 200);
  assert.equal(first.body.duplicate, false);
  const retry = await submit();
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);

  const canonical = await waitFor(
    () => fb(`classroomGameResults/${cogSessionId}/${ghostKey}/${resultId}`),
    "canonical receipt"
  );
  const mirror = await waitFor(
    () => fb(`classroomGameResultsByAssignment/${assignmentId}/${ghostKey}/${resultId}`),
    "assignment receipt mirror"
  );
  assert.equal(canonical.percentage, 88);
  assert.equal(mirror.percentage, 88);

  console.log("E2E teacher: Results UI shows receipt, not grade/PDF");
  await teacherPage.goto(`${YT}/teacher-assignments.html`, { waitUntil: "domcontentloaded" });
  const assignmentCard = teacherPage.locator(`[data-assignment-select="${assignmentId}"]`);
  await assignmentCard.waitFor({ state: "visible", timeout: 30000 });
  await assignmentCard.click();
  const resultCard = teacherPage.locator(`.cog-result-card[data-cog-result-student-key="${ghostKey}"]`);
  await resultCard.waitFor({ state: "visible", timeout: 15000 });
  const resultText = await resultCard.textContent();
  assert.match(resultText, /FAKE-20|GHOST20/);
  assert.match(resultText, /88%/);
  assert.match(resultText, /Verb Runner/);
  assert.equal(await teacherPage.locator("#syncAiGradesBtn").isDisabled(), true);
  assert.equal(await teacherPage.locator("#openDriveFolderBtn").isDisabled(), true);

  console.log("E2E teacher: END ACTIVITY");
  cogTeacherPage.once("dialog", (d) => d.accept());
  await cogTeacherPage.locator("#closeSession").click();
  await waitFor(
    async () => (await cogTeacherPage.locator("#teacherNotice").textContent())?.includes(`Session ${cogSessionId} ended.`),
    "END ACTIVITY"
  );
  const ended = await waitFor(async () => {
    const current = await fb("session/current");
    return current?.connectedGame?.status === "ended" ? current.connectedGame : null;
  }, "ended connectedGame");
  assert.equal(ended.cogSessionId, cogSessionId);
  assert.equal((await fb(`classroomGames/verbRunnerV2/sessions/${cogSessionId}`))?.status, "closed");

  console.log("E2E PASS: preview navigation, identity, JOIN GAME, heartbeat, idempotent receipt, Results UI, END ACTIVITY.");
}

try {
  await main();
} finally {
  await cleanup();
}
