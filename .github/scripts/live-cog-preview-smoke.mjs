import { chromium } from "playwright";

const YT = "https://feature-live-cog-session-cur.youteach.pages.dev";
const COG = "https://feature-live-cog-session-cur.classroom-online-games.pages.dev";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(browser, url) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  assert(response, `No navigation response for ${url}`);
  return { page, response, pageErrors };
}

const browser = await chromium.launch({ headless: true });
try {
  {
    const { page, response, pageErrors } = await openPage(browser, `${YT}/teacher-login.html`);
    assert(response.status() === 200, `Teacher login returned ${response.status()}`);
    await page.locator("#username").waitFor();
    await page.locator("#password").waitFor();
    await page.locator("#loginBtn").waitFor();
    assert(pageErrors.length === 0, `Teacher login page errors: ${pageErrors.join(" | ")}`);
    console.log("PASS teacher login page");
    await page.close();
  }

  {
    const page = await browser.newPage();
    const pageErrors = [];
    const failedRequests = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || "failed"}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const response = await page.goto(`${YT}/teacher.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert(response?.status() === 200, `Teacher Home returned ${response?.status()}`);
    await page.waitForTimeout(5000);
    console.log("TEACHER_REDIRECT_DIAG URL=" + page.url());
    console.log("TEACHER_REDIRECT_DIAG PAGE_ERRORS=" + JSON.stringify(pageErrors));
    console.log("TEACHER_REDIRECT_DIAG FAILED_REQUESTS=" + JSON.stringify(failedRequests));
    console.log("TEACHER_REDIRECT_DIAG CONSOLE_ERRORS=" + JSON.stringify(consoleErrors));
    const scriptSrc = await page.locator('script[type="module"]').first().getAttribute("src");
    console.log("TEACHER_REDIRECT_DIAG MODULE=" + scriptSrc);
    assert(/\/teacher-login(?:\.html)?(?:[?#]|$)/.test(page.url()), "Teacher Home did not redirect without a teacher session.");
    console.log("PASS teacher auth redirect");
    await page.close();
  }

  {
    const { page } = await openPage(browser, `${YT}/student-buzzer.html`);
    await page.waitForURL(/student\.html/, { timeout: 15000 });
    console.log("PASS student auth redirect");
    await page.close();
  }

  {
    const { page, response, pageErrors } = await openPage(browser, `${COG}/teacher/`);
    assert(response.status() === 200, `COG teacher menu returned ${response.status()}`);
    await page.locator("h1").filter({ hasText: "Teacher Monitors" }).waitFor();
    await page.waitForFunction(() => {
      const text = document.querySelector("#gameGateMessage")?.textContent || "";
      return text.includes("Standalone teacher mode");
    }, null, { timeout: 15000 });
    assert(pageErrors.length === 0, `COG teacher menu page errors: ${pageErrors.join(" | ")}`);
    console.log("PASS COG standalone teacher menu");
    await page.close();
  }

  {
    const { page, response, pageErrors } = await openPage(
      browser,
      `${COG}/teacher/?ytLiveTeacher=definitely-invalid&issuer=${encodeURIComponent(YT)}`
    );
    assert(response.status() === 200, `COG launch page returned ${response.status()}`);
    await page.waitForFunction(() => {
      const text = document.querySelector("#gameGateMessage")?.textContent || "";
      return /invalid|expired|verify|session/i.test(text);
    }, null, { timeout: 15000 });
    const message = await page.locator("#gameGateMessage").textContent();
    assert(/invalid|expired/i.test(message || ""), `Unexpected invalid-launch message: ${message}`);
    assert(pageErrors.length === 0, `COG invalid-launch page errors: ${pageErrors.join(" | ")}`);
    console.log("PASS browser CORS + invalid teacher launch handling");
    await page.close();
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${COG}/teacher/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const result = await page.evaluate(async ({ yt }) => {
      const response = await fetch(`${yt}/api/cog-live-session-register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer definitely-invalid"
        },
        body: JSON.stringify({
          gameId: "verb-runner",
          gameName: "Verb Runner",
          cogSessionId: "E2E-INVALID"
        })
      });
      return {
        status: response.status,
        allowOrigin: response.headers.get("access-control-allow-origin"),
        payload: await response.json()
      };
    }, { yt: YT });
    assert(result.status === 401, `Cross-origin register expected 401, got ${result.status}`);
    assert(result.allowOrigin === COG, `CORS origin mismatch: ${result.allowOrigin}`);
    assert(result.payload?.ok === false, "Expected JSON error payload");
    console.log("PASS COG -> YouTeach live-session CORS");
    await context.close();
  }

  {
    const { page, response } = await openPage(browser, `${COG}/Verb-Runner/teacher/`);
    assert(response.status() === 200, `Verb Runner monitor returned ${response.status()}`);
    await page.locator("#createSession").waitFor();
    await page.locator("#studentGrid").waitFor();
    console.log("PASS Verb Runner monitor loads");
    await page.close();
  }

  {
    const { page, response } = await openPage(browser, `${COG}/Support-Meter/teacher/`);
    assert(response.status() === 200, `Support Meter monitor returned ${response.status()}`);
    await page.locator("#createSession").waitFor();
    await page.locator("#studentGrid").waitFor();
    console.log("PASS Support Meter monitor loads");
    await page.close();
  }

  {
    const { page, response } = await openPage(browser, `${COG}/OSASCOMP/teacher/`);
    assert(response.status() === 200, `OSASCOMP monitor returned ${response.status()}`);
    await page.locator("#connect").waitFor();
    await page.locator("#students").waitFor();
    console.log("PASS OSASCOMP monitor loads");
    await page.close();
  }

  console.log("LIVE_COG_PREVIEW_BROWSER_SMOKE=PASS");
} finally {
  await browser.close();
}
