import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { Client } from "pg";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres@localhost:55433/inkwellio";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const WEB_DIR = path.join(REPO_ROOT, "apps/web");
const NEXT_BIN = path.join(REPO_ROOT, "node_modules/next/dist/bin/next");
const SHOTS_DIR =
  process.env.PHASE2_SHOTS_DIR || path.join(REPO_ROOT, ".logs/phase2-final-shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const RUN_TAG = Date.now();
const QA_EMAIL = `qa-waveb-${RUN_TAG}@example.test`;
const QA_PASSWORD = "WaveB-Test-Password-2026!";
const QA_NAME = "Wave B Writer";
const PUB_NAME = `Half Space QA ${RUN_TAG}`;
const PUB_EXPECTED_HANDLE = `half-space-qa-${RUN_TAG}`;
const CONFIRM_PLAIN_TOKEN = `erase-token-${RUN_TAG}`;

const SEED_TOPICS = [
  ["tactics", "Tactics"],
  ["match-reports", "Match Reports"],
  ["analytics", "Analytics"],
  ["transfers", "Transfers"],
  ["coaching", "Coaching"],
  ["youth-development", "Youth Development"],
  ["goalkeeping", "Goalkeeping"],
  ["football-history", "Football History"],
  ["supporter-culture", "Supporter Culture"],
  ["grassroots", "Grassroots"],
  ["set-pieces", "Set Pieces"],
  ["refereeing", "Refereeing"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
function assertCond(cond, label, detail) {
  if (!cond) {
    failures.push({ label, detail });
    console.error(`  [FAIL] ${label}:`, JSON.stringify(detail));
  } else {
    console.log(`  [PASS] ${label}:`, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("Port lookup failed"));
        return;
      }
      const { port } = addr;
      s.close(() => resolve(port));
    });
  });
}

function makeCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params, msg.sessionId);
    }
  });
  const ready = new Promise((r) => ws.addEventListener("open", r));
  const call = async (method, params = {}, sessionId = undefined) => {
    await ready;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  };
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  return { ws, call, on };
}

async function startServer(port) {
  const proc = spawn(
    process.execPath,
    [NEXT_BIN, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: WEB_DIR,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL,
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET || "wave-b-local-cdp-secret-0123456789abcdef",
        BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
        EMAIL_TRANSPORT: "capture",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return proc;
    } catch {}
    await sleep(150);
  }
  throw new Error("Next server failed to become healthy");
}

async function startChrome(cdpPort, profileDir) {
  fs.rmSync(profileDir, { recursive: true, force: true });
  const proc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      const v = await res.json();
      if (v?.webSocketDebuggerUrl) return { proc, wsUrl: v.webSocketDebuggerUrl };
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome CDP endpoint failed to start");
}

async function openContextPage(cdp, opts = {}) {
  const { browserContextId } = await cdp.call("Target.createBrowserContext", {});
  const page = await openTabInContext(cdp, browserContextId, opts);
  const dispose = () => cdp.call("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  return { ...page, browserContextId, dispose };
}

async function openTabInContext(cdp, browserContextId, opts = {}) {
  const { targetId } = await cdp.call("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.call("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Network.enable", {}, sessionId);

  const width = opts.width || 1440;
  const height = opts.height || 900;
  await cdp.call(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: !!opts.mobile,
    },
    sessionId,
  );

  await cdp.call(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `
        try {
          localStorage.setItem("inkwellio-theme", ${JSON.stringify(opts.theme || "dark")});
          localStorage.setItem("inkwellio-motion-paused", "0");
        } catch {}
        window.__diag = { cls: 0, lcpMs: 0, longTasks: [] };
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__diag.cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__diag.lcpMs = Math.round(e.startTime);
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__diag.longTasks.push(Math.round(e.duration));
        }).observe({ type: "longtask", buffered: true });
      `,
    },
    sessionId,
  );

  const telemetry = { consoleErrors: [], pageErrors: [], thirdParty: [], fiveHundreds: [], ignoreMock503: false };
  cdp.on("Runtime.consoleAPICalled", (p, sid) => {
    if (sid === sessionId && p.type === "error") {
      telemetry.consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
  cdp.on("Runtime.exceptionThrown", (p, sid) => {
    if (sid === sessionId) telemetry.pageErrors.push(p.exceptionDetails?.text || "exception");
  });
  cdp.on("Network.requestWillBeSent", (p, sid) => {
    if (sid !== sessionId) return;
    try {
      const u = new URL(p.request.url);
      if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "127.0.0.1") {
        telemetry.thirdParty.push(p.request.url);
      }
    } catch {}
  });
  cdp.on("Network.responseReceived", (p, sid) => {
    if (sid === sessionId && p.response.status >= 500) {
      if (telemetry.ignoreMock503 && p.response.status === 503 && p.response.url.includes("/draft")) {
        return;
      }
      telemetry.fiveHundreds.push({ url: p.response.url, status: p.response.status });
    }
  });

  const evalFn = async (expr) => {
    const r = await cdp.call(
      "Runtime.evaluate",
      { expression: expr, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (r.exceptionDetails) {
      throw new Error(`Eval error: ${r.exceptionDetails.text}`);
    }
    return r.result?.value;
  };

  const goto = async (url) => {
    await cdp.call("Page.navigate", { url }, sessionId);
    for (let i = 0; i < 80; i += 1) {
      if ((await evalFn("document.readyState")) === "complete") break;
      await sleep(100);
    }
    await sleep(350);
  };

  const waitForText = async (needle, timeoutMs = 10000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const text = await evalFn("document.body?.innerText || ''");
      if (typeof text === "string" && text.includes(needle)) return true;
      await sleep(150);
    }
    return false;
  };

  const waitForUrlIncludes = async (segment, timeoutMs = 10000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const href = await evalFn("location.href");
      if (typeof href === "string" && href.includes(segment)) return href;
      await sleep(150);
    }
    return null;
  };

  const setInputValue = async (selector, value) => {
    const focused = await evalFn(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      if (el.select) el.select();
      return true;
    })()`);
    if (!focused) return false;
    await evalFn(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return;
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await cdp.call("Input.insertText", { text: value }, sessionId);
    await sleep(60);
    return true;
  };

  const clickButtonByText = async (label) => {
    return evalFn(`(() => {
      const candidates = [...document.querySelectorAll("button, a")];
      const match = candidates.find((el) => el.textContent && el.textContent.trim() === ${JSON.stringify(label)});
      if (!match) return false;
      match.click();
      return true;
    })()`);
  };

  const saveShot = async (filename) => {
    await evalFn("window.scrollTo({ top: 0, behavior: 'instant' })");
    await sleep(300);
    const { data } = await cdp.call("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(path.join(SHOTS_DIR, filename), Buffer.from(data, "base64"));
  };

  const inspectLayout = async () => {
    return evalFn(`(() => {
      const overflowPx = Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const smallControls = [];
      for (const el of document.querySelectorAll("button, a, input, [role='tab']")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const isInlineText = el.tagName === "A" && !el.className.includes("min-h-") && cs.display === "inline";
        if (!isInlineText && (rect.height < 44 || rect.width < 44)) {
          smallControls.push({ tag: el.tagName, text: (el.textContent || "").trim().slice(0, 30), w: Math.round(rect.width), h: Math.round(rect.height) });
        }
      }
      return {
        overflowPx,
        smallControls,
        cls: +(window.__diag?.cls || 0).toFixed(4),
        lcpMs: window.__diag?.lcpMs || 0,
        maxLongTaskMs: Math.max(0, ...(window.__diag?.longTasks || [0])),
        footerText: document.querySelector("footer")?.innerText || "",
      };
    })()`);
  };

  return {
    targetId,
    sessionId,
    telemetry,
    evalFn,
    goto,
    waitForText,
    waitForUrlIncludes,
    setInputValue,
    clickButtonByText,
    saveShot,
    inspectLayout,
  };
}

async function seedCuratedTopics(pgClient) {
  for (const [slug, name] of SEED_TOPICS) {
    await pgClient.query(
      "INSERT INTO topics (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING",
      [slug, name],
    );
  }
}

async function cleanupQaData(pgClient) {
  await pgClient.query("DELETE FROM rate_limit_counters");
  await pgClient.query("DELETE FROM rate_limits");
  await pgClient.query(
    `DELETE FROM audit_events WHERE actor_user_id IN (SELECT id FROM users WHERE email LIKE $1) OR metadata::text LIKE $1`,
    ["qa-waveb-%"],
  );
  await pgClient.query("DELETE FROM users WHERE email LIKE $1", ["qa-waveb-%"]);
  await pgClient.query(
    "DELETE FROM verifications WHERE identifier LIKE $1 OR value LIKE $1",
    ["%qa-waveb-%"],
  );

  const usersRes = await pgClient.query(
    "SELECT count(*)::int AS n FROM users WHERE email LIKE $1",
    ["qa-waveb-%"],
  );
  const pubsRes = await pgClient.query(
    "SELECT count(*)::int AS n FROM publications WHERE slug LIKE $1",
    ["half-space-qa-%"],
  );
  const countersRes = await pgClient.query(
    "SELECT count(*)::int AS n FROM rate_limit_counters",
  );
  return {
    remainingQaUsers: usersRes.rows[0].n,
    remainingQaPubs: pubsRes.rows[0].n,
    remainingCounters: countersRes.rows[0].n,
  };
}

/**
 * Regression for the scroll-to-bottom jump: from any route, clicking the
 * Inkwellio mark must land on `/` at scrollY === 0. The old build scrolled to
 * the Publishing section because Next's route-transition scroll reset ran
 * while `html { scroll-behavior: smooth }` was active.
 */
async function assertHomeLandsAtTop(page, baseUrl, fromRoute, brandSelector) {
  await page.goto(`${baseUrl}${fromRoute}`);
  await sleep(300);
  const clickResult = await page.evalFn(`(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    const brand = document.querySelector(${JSON.stringify(brandSelector)});
    if (!brand) return false;
    brand.click();
    return true;
  })()`);
  let landed = false;
  for (let i = 0; i < 80; i += 1) {
    if ((await page.evalFn("location.pathname")) === "/") {
      landed = true;
      break;
    }
    await sleep(150);
  }
  // Next's client transition can briefly hold both the old and new trees;
  // wait until the single footer has settled before asserting shell metrics.
  for (let i = 0; i < 40; i += 1) {
    const footers = await page.evalFn("document.querySelectorAll('.site-footer').length");
    if (footers <= 1) break;
    await sleep(150);
  }
  await sleep(600);
  const y = await page.evalFn("Math.round(window.scrollY)");
  assertCond(
    Boolean(clickResult) && landed && y === 0,
    `${fromRoute} -> / lands at window.scrollY === 0`,
    { clickResult, landed, y },
  );
}

async function main() {
  const pgClient = new Client({ connectionString: DATABASE_URL });
  await pgClient.connect();
  await seedCuratedTopics(pgClient);

  const port = await freePort();
  const cdpPort = await freePort();
  const profileDir = path.join(REPO_ROOT, `.logs/chrome-phase2-${cdpPort}`);
  const server = await startServer(port);
  const { proc: chrome, wsUrl } = await startChrome(cdpPort, profileDir);
  const cdp = makeCdp(wsUrl);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log("\n=== 1. ANONYMOUS ROUTE GUARDS ===");
    const anonCtx = await openContextPage(cdp, { width: 1440, height: 900, theme: "dark" });
    for (const p of ["/dashboard", "/studio/00000000-0000-0000-0000-000000000000", "/settings/privacy"]) {
      const r = await fetch(`${baseUrl}${p}`, { redirect: "manual" });
      const rawHtml = await r.text();
      await anonCtx.goto(`${baseUrl}${p}`);
      const redirectedUrl = await anonCtx.waitForUrlIncludes(`/sign-in?next=${encodeURIComponent(p)}`);
      assertCond(
        Boolean(redirectedUrl) && !rawHtml.includes("New draft") && !rawHtml.includes("Export JSON"),
        `anonymous ${p} fails closed and redirects Chrome to /sign-in?next=`,
        { httpStatus: r.status, redirectedUrl },
      );
    }
    await anonCtx.dispose();

    console.log("\n=== 2. SIGN-UP -> VERIFY -> SIGN-IN -> /dashboard ===");
    const writerCtx = await openContextPage(cdp, { width: 1440, height: 900, theme: "dark" });
    await writerCtx.goto(`${baseUrl}/sign-up`);
    await writerCtx.waitForText("Create account");
    await sleep(300);
    await writerCtx.setInputValue("#sign-up-name", QA_NAME);
    await writerCtx.setInputValue("#sign-up-email", QA_EMAIL);
    await writerCtx.setInputValue("#sign-up-password", QA_PASSWORD);
    await writerCtx.clickButtonByText("Create account");
    const sawCheckEmail = await writerCtx.waitForText("Check your email");
    assertCond(sawCheckEmail, "sign-up displays email verification prompt", { qaEmail: QA_EMAIL });

    const verResult = await pgClient.query(
      "UPDATE users SET email_verified = true WHERE email = $1 RETURNING id",
      [QA_EMAIL],
    );
    assertCond(verResult.rowCount === 1, "verified QA writer row exists in Postgres", {
      userId: verResult.rows[0]?.id,
    });
    const qaUserId = verResult.rows[0].id;

    await writerCtx.goto(`${baseUrl}/sign-in`);
    await writerCtx.waitForText("Password");
    await sleep(300);
    await writerCtx.setInputValue("#sign-in-email", QA_EMAIL);
    await writerCtx.setInputValue("#sign-in-password", QA_PASSWORD);
    await writerCtx.clickButtonByText("Sign in");
    const landedDash = await writerCtx.waitForUrlIncludes("/dashboard");
    const hydratedDash = await writerCtx.waitForText("Create publication");
    assertCond(Boolean(landedDash) && hydratedDash, "post-login redirects to hydrated /dashboard", landedDash);
    await sleep(350);

    await writerCtx.setInputValue("#pub-name", PUB_NAME);
    await sleep(200);
    const previewTxt = await writerCtx.evalFn(`document.querySelector("#pub-slug-preview")?.innerText || ""`);
    assertCond(
      previewTxt.includes(`/@${PUB_EXPECTED_HANDLE}`),
      "dashboard live handle preview matches publication name",
      previewTxt,
    );
    await writerCtx.saveShot("dashboard-create-dark.png");

    await writerCtx.clickButtonByText("Create publication");
    const sawCreatedPub = await writerCtx.waitForText(PUB_NAME);
    const dashCreateLayout = await writerCtx.inspectLayout();
    assertCond(
      sawCreatedPub && dashCreateLayout.overflowPx <= 0 && !dashCreateLayout.footerText.includes("inkwellio.example"),
      "dashboard creates publication cleanly with updated footer",
      dashCreateLayout,
    );

    console.log("\n=== 3. STUDIO EDITOR + XSS ESCAPE + 409/429/503 RECOVERY ===");
    await writerCtx.clickButtonByText("New draft");
    const landedStudio = await writerCtx.waitForUrlIncludes("/studio/");
    const hydratedStudio = await writerCtx.waitForText("Save draft");
    assertCond(Boolean(landedStudio) && hydratedStudio, "New draft opens hydrated /studio/[postId]", landedStudio);
    await sleep(350);
    const postId = decodeURIComponent(landedStudio.split("/studio/")[1].split("?")[0]);

    const xssBody = [
      "## Half-Space Pressing",
      "",
      '<script>window.__xssProbe = "EXECUTED";</script>',
      "",
      "[bad](javascript:alert(1))",
      "",
      "Measured buildup keeps the ball progression clean.",
    ].join("\n");

    await writerCtx.setInputValue("#post-title", "QA Tactical Analysis");
    await writerCtx.setInputValue("#post-body", xssBody);
    await writerCtx.clickButtonByText("Save draft");
    const sawSavedV1 = await writerCtx.waitForText("Saved · v1");
    assertCond(sawSavedV1, "manual save advances draft version to v1", "Saved · v1");

    await writerCtx.clickButtonByText("Preview");
    await sleep(200);
    const previewCheck = await writerCtx.evalFn(`({
      xss: window.__xssProbe || null,
      text: document.body.innerText,
      hasRawScript: !!document.querySelector(".editorial-reading script"),
      smallCtrls: document.querySelectorAll("button").length,
    })`);
    assertCond(
      previewCheck.xss === null &&
        !previewCheck.hasRawScript &&
        previewCheck.text.includes("Half-Space Pressing") &&
        previewCheck.text.includes("<script>window.__xssProbe"),
      "studio Preview escapes raw HTML script tags cleanly",
      { xss: previewCheck.xss, hasRawScript: previewCheck.hasRawScript },
    );
    await writerCtx.clickButtonByText("Write");

    // Topics & slug
    await writerCtx.clickButtonByText("Tactics");
    await writerCtx.clickButtonByText("Analytics");
    await writerCtx.clickButtonByText("Save topics");
    const sawTopicsSaved = await writerCtx.waitForText("Topics saved.");
    assertCond(sawTopicsSaved, "curated topic assignment succeeds", sawTopicsSaved);

    await writerCtx.setInputValue("#post-slug", `qa-tactical-${RUN_TAG}`);
    await writerCtx.clickButtonByText("Rename URL");
    const sawSlugUpdated = await writerCtx.waitForText("URL slug updated");
    assertCond(sawSlugUpdated, "post URL slug rename succeeds", sawSlugUpdated);

    await writerCtx.saveShot("studio-dark.png");

    // Dark + Light screenshots + mobile 390x844
    await writerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "light"); document.documentElement.setAttribute("data-theme", "light");`);
    await writerCtx.saveShot("studio-light.png");
    await writerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "dark"); document.documentElement.setAttribute("data-theme", "dark");`);

    // Real 409 Conflict test: advance server version via API with browser session cookie
    const conflictSetup = await writerCtx.evalFn(`(async () => {
      const res = await fetch(${JSON.stringify(`/api/posts/${postId}/draft`)}, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          title: "Server External Version 2",
          bodyMarkdown: "Updated on another tab first."
        })
      });
      return res.status;
    })()`);
    assertCond(conflictSetup === 200, "simulated second-tab draft save creates v2 on server", conflictSetup);

    await writerCtx.setInputValue("#post-body", "Local unsaved line that collides with v2");
    await writerCtx.clickButtonByText("Save draft");
    const sawConflict = await writerCtx.waitForText("Copy my text");
    const sawReloadBtn = await writerCtx.waitForText("Reload latest draft");
    assertCond(sawConflict && sawReloadBtn, "real 409 conflict displays Copy my text and Reload latest draft", {
      sawConflict,
      sawReloadBtn,
    });
    await writerCtx.clickButtonByText("Reload latest draft");
    const sawReloaded = await writerCtx.waitForText("Loaded the latest saved draft version.");
    assertCond(sawReloaded, "Reload latest draft syncs local state to server v2", sawReloaded);

    // Real CDP interception for 429 Retry-After and non-JSON 503 recovery
    await cdp.call("Fetch.enable", { patterns: [{ urlPattern: "*draft*", requestStage: "Request" }] }, writerCtx.sessionId);
    let interceptMode = "429";
    cdp.on("Fetch.requestPaused", async (p, sid) => {
      if (sid !== writerCtx.sessionId) return;
      if (interceptMode === "429" && p.request.method === "PUT") {
        await cdp.call(
          "Fetch.fulfillRequest",
          {
            requestId: p.requestId,
            responseCode: 429,
            responseHeaders: [
              { name: "content-type", value: "application/json" },
              { name: "retry-after", value: "6" },
            ],
            body: Buffer.from(JSON.stringify({ code: "RATE_LIMITED", message: "Slow down", requestId: "cdp-429" })).toString("base64"),
          },
          writerCtx.sessionId,
        );
        return;
      }
      if (interceptMode === "503" && p.request.method === "PUT") {
        await cdp.call(
          "Fetch.fulfillRequest",
          {
            requestId: p.requestId,
            responseCode: 503,
            responseHeaders: [{ name: "content-type", value: "text/plain" }],
            body: Buffer.from("upstream overloaded").toString("base64"),
          },
          writerCtx.sessionId,
        );
        return;
      }
      await cdp.call("Fetch.continueRequest", { requestId: p.requestId }, writerCtx.sessionId);
    });

    await writerCtx.setInputValue("#post-body", "Trigger 429 rate limit guard cleanly.");
    await writerCtx.clickButtonByText("Save draft");
    const saw429Cooldown = await writerCtx.waitForText("Write actions paused for");
    assertCond(saw429Cooldown, "429 Retry-After pauses write actions with countdown banner", saw429Cooldown);

    // Wait out 6s cooldown briefly or clear intercept for 503
    await sleep(6_300);
    interceptMode = "503";
    writerCtx.telemetry.ignoreMock503 = true;
    await writerCtx.setInputValue("#post-body", "Trigger 503 non-JSON fallback safely.");
    await writerCtx.clickButtonByText("Save draft");
    const saw503 = await writerCtx.waitForText("Service temporarily unavailable");
    const sawRetry = await writerCtx.waitForText("Retry save");
    const preservedText = await writerCtx.evalFn(`document.querySelector("#post-body")?.value || ""`);
    writerCtx.telemetry.ignoreMock503 = false;
    assertCond(
      saw503 && sawRetry && preservedText.includes("Trigger 503 non-JSON fallback safely"),
      "503 non-JSON surfaces safe message, Retry save button, and preserves unsaved text",
      { saw503, sawRetry },
    );
    await cdp.call("Fetch.disable", {}, writerCtx.sessionId);

    // Save final body and Publish live
    await writerCtx.setInputValue("#post-title", "Published Tactical Study");
    await writerCtx.setInputValue("#post-body", "## First Third Buildup\n\nOverloading the left half-space.");
    await writerCtx.clickButtonByText("Publish post");
    const sawPublished = await writerCtx.waitForText("Post published live.");
    assertCond(sawPublished, "Publish post publishes live from studio", sawPublished);

    console.log("\n=== 4. DASHBOARD LIFECYCLE (TRASH / RESTORE / PUBLISH) ===");
    await writerCtx.goto(`${baseUrl}/dashboard`);
    await writerCtx.waitForText("Published");
    await sleep(300);
    await writerCtx.evalFn(`document.querySelector('[role="tab"][data-tab="published"]')?.click()`);
    await sleep(250);
    await writerCtx.saveShot("dashboard-published-dark.png");
    await writerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "light"); document.documentElement.setAttribute("data-theme", "light");`);
    await writerCtx.saveShot("dashboard-published-light.png");
    await writerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "dark"); document.documentElement.setAttribute("data-theme", "dark");`);

    await writerCtx.clickButtonByText("Move to trash");
    await writerCtx.clickButtonByText("Confirm delete");
    const sawDeleted = await writerCtx.waitForText("to trash.");
    assertCond(sawDeleted, "Dashboard Move to trash deletes post", sawDeleted);

    await writerCtx.evalFn(`document.querySelector('[role="tab"][data-tab="deleted"]')?.click()`);
    await sleep(250);
    await writerCtx.clickButtonByText("Restore");
    const sawRestored = await writerCtx.waitForText("to drafts.");
    assertCond(sawRestored, "Dashboard Trash Restore restores post to Drafts", sawRestored);

    await writerCtx.clickButtonByText("Publish");
    const sawDashPublished = await writerCtx.waitForText("Published \"");
    assertCond(sawDashPublished, "Dashboard row Publish button republishes draft", sawDashPublished);

    // Mobile 390x844 layout & budget checks on Dashboard, Studio & Settings
    await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, writerCtx.sessionId);
    await writerCtx.goto(`${baseUrl}/dashboard`);
    await writerCtx.saveShot("dashboard-mobile-dark.png");
    const mobDashLayout = await writerCtx.inspectLayout();
    assertCond(
      mobDashLayout.overflowPx <= 0 && mobDashLayout.smallControls.length === 0 && mobDashLayout.cls < 0.1,
      "390x844 mobile dashboard has 0 overflow, >=44px targets, and CLS < 0.1",
      mobDashLayout,
    );
    await writerCtx.goto(`${baseUrl}/studio/${encodeURIComponent(postId)}`);
    await writerCtx.saveShot("studio-mobile-dark.png");
    const mobStudioLayout = await writerCtx.inspectLayout();
    assertCond(
      mobStudioLayout.overflowPx <= 0 && mobStudioLayout.cls < 0.1,
      "390x844 mobile studio has 0 overflow and CLS < 0.1",
      mobStudioLayout,
    );
    await cdp.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, writerCtx.sessionId);

    console.log("\n=== 5. HOME SCROLL REGRESSION (FROM /dashboard) ===");
    await assertHomeLandsAtTop(writerCtx, baseUrl, "/dashboard", "a.workspace-brand");

    console.log("\n=== 6. ANONYMOUS PUBLIC READER ROUTES ===");
    const readerCtx = await openContextPage(cdp, { width: 1440, height: 900, theme: "dark" });
    await readerCtx.goto(`${baseUrl}/@${PUB_EXPECTED_HANDLE}/qa-tactical-${RUN_TAG}`);
    const sawArticle = await readerCtx.waitForText("Published Tactical Study");
    const readerDiag = await readerCtx.inspectLayout();
    assertCond(
      sawArticle && readerDiag.overflowPx <= 0 && readerDiag.cls < 0.1 && !readerDiag.footerText.includes("inkwellio.example"),
      "anonymous reader sees live published article cleanly without placeholder domain",
      { sawArticle, ...readerDiag },
    );
    await readerCtx.saveShot("reader-dark.png");
    await readerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "light"); document.documentElement.setAttribute("data-theme", "light");`);
    await readerCtx.saveShot("reader-light.png");

    await readerCtx.goto(`${baseUrl}/topics/tactics`);
    const sawTopicArticle = await readerCtx.waitForText("Published Tactical Study");
    assertCond(sawTopicArticle, "topic feed lists published article", sawTopicArticle);
    await readerCtx.goto(`${baseUrl}/search?q=Tactical`);
    const sawSearchArticle = await readerCtx.waitForText("Published Tactical Study");
    assertCond(sawSearchArticle, "search finds published article", sawSearchArticle);

    console.log("\n=== 7. HOME SCROLL REGRESSION (FROM /topics) + PUBLIC FOOTER TOGGLE ===");
    await assertHomeLandsAtTop(readerCtx, baseUrl, "/topics", "a.nav-logo");
    // Full reload after the client-transition check guarantees a settled DOM.
    await readerCtx.goto(`${baseUrl}/`);
    const publicShell = await readerCtx.evalFn(`(() => ({
      headerMotion: document.querySelectorAll("header [data-motion-toggle]").length,
      footerMotion: document.querySelectorAll(".site-footer button[data-motion-toggle]").length,
      marketing: [...document.querySelectorAll("header a")].filter((a) => ["Principles", "Editor", "Reading", "Publishing"].includes(a.textContent.trim())).length,
      footerText: document.querySelector(".site-footer")?.innerText || "",
    }))()`);
    assertCond(
      publicShell.headerMotion === 0 && publicShell.footerMotion === 1 && publicShell.marketing === 4,
      "/ header has 0 motion toggles, footer has 1, and 4 marketing anchors",
      publicShell,
    );
    await readerCtx.evalFn(`document.querySelector(".site-footer [data-motion-toggle]").click()`);
    await sleep(200);
    const paused = await readerCtx.evalFn(`document.documentElement.getAttribute("data-motion")`);
    assertCond(paused === "paused", "footer Pause motion sets data-motion=paused", paused);
    await readerCtx.evalFn(`document.querySelector(".site-footer [data-motion-toggle]").click()`);
    await sleep(200);
    const resumed = await readerCtx.evalFn(`document.documentElement.getAttribute("data-motion")`);
    assertCond(resumed === "active", "footer Resume motion sets data-motion=active", resumed);
    await readerCtx.dispose();

    console.log("\n=== 6. /settings/privacy EXPORT & TWO-STEP ERASURE ===");
    await writerCtx.goto(`${baseUrl}/settings/privacy`);
    const sawSettings = await writerCtx.waitForText(QA_EMAIL);
    const settingsLayout = await writerCtx.inspectLayout();
    assertCond(
      sawSettings && settingsLayout.overflowPx <= 0 && settingsLayout.smallControls.length === 0,
      "/settings/privacy renders signed-in email, publication readout, and clean targets",
      { sawSettings, overflowPx: settingsLayout.overflowPx, smallControls: settingsLayout.smallControls },
    );
    await writerCtx.saveShot("settings-dark.png");
    await writerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "light"); document.documentElement.setAttribute("data-theme", "light");`);
    await writerCtx.saveShot("settings-light.png");
    await writerCtx.evalFn(`localStorage.setItem("inkwellio-theme", "dark"); document.documentElement.setAttribute("data-theme", "dark");`);

    console.log("\n=== 8. FINAL SCREENSHOT SWEEPS (1440x900 + 390x844, dark + light) ===");
    const sweepRoutes = [
      ["home", "/"],
      ["topics", "/topics"],
      ["dashboard", "/dashboard"],
      ["studio", `/studio/${encodeURIComponent(postId)}`],
      ["reader", `/@${PUB_EXPECTED_HANDLE}/qa-tactical-${RUN_TAG}`],
      ["settings", "/settings/privacy"],
    ];
    for (const vp of [
      { label: "desktop", width: 1440, height: 900, mobile: false },
      { label: "mobile", width: 390, height: 844, mobile: true },
    ]) {
      await cdp.call(
        "Emulation.setDeviceMetricsOverride",
        { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile },
        writerCtx.sessionId,
      );
      for (const [name, route] of sweepRoutes) {
        await writerCtx.goto(`${baseUrl}${route}`);
        await sleep(250);
        const shellAudit = await writerCtx.evalFn(`(() => ({
          headerMotion: document.querySelectorAll("header [data-motion-toggle]").length,
          marketing: [...document.querySelectorAll("header a")].filter((a) => ["Principles", "Editor", "Reading", "Publishing"].includes(a.textContent.trim())).length,
          overflowPx: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
        }))()`);
        assertCond(
          shellAudit.headerMotion === 0 &&
            shellAudit.marketing === (route === "/" ? 4 : 0) &&
            shellAudit.overflowPx <= 1,
          `${vp.label}/dark ${route}: 0 header toggles, correct anchors, 0 overflow`,
          shellAudit,
        );
        await writerCtx.saveShot(`${name}-${vp.label}-dark.png`);
        await writerCtx.evalFn(
          `localStorage.setItem("inkwellio-theme", "light"); document.documentElement.setAttribute("data-theme", "light");`,
        );
        await sleep(150);
        await writerCtx.saveShot(`${name}-${vp.label}-light.png`);
        await writerCtx.evalFn(
          `localStorage.setItem("inkwellio-theme", "dark"); document.documentElement.setAttribute("data-theme", "dark");`,
        );
      }
    }
    await cdp.call(
      "Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      writerCtx.sessionId,
    );
    await writerCtx.goto(`${baseUrl}/settings/privacy`);
    await writerCtx.waitForText(QA_EMAIL);

    await writerCtx.clickButtonByText("Export JSON");
    const sawExportDone = await writerCtx.waitForText("Downloaded inkwellio-export-");
    assertCond(sawExportDone, "/settings/privacy Export JSON downloads archive cleanly", sawExportDone);

    await writerCtx.setInputValue("#erasure-password", QA_PASSWORD);
    await writerCtx.clickButtonByText("Send confirmation code");
    const sawErasureCodePrompt = await writerCtx.waitForText("Sent deletion confirmation code");
    assertCond(sawErasureCodePrompt, "erasure Step 1 password verification succeeds (202)", sawErasureCodePrompt);

    // Replace verification hash in DB with known SHA-256 hash of CONFIRM_PLAIN_TOKEN to exercise Step 2 confirm UI
    const hashed = createHash("sha256").update(CONFIRM_PLAIN_TOKEN).digest("hex");
    await pgClient.query(
      "UPDATE verifications SET value = $1 WHERE identifier = $2",
      [hashed, `account-erasure:${qaUserId}`],
    );

    await writerCtx.setInputValue("#erasure-token", CONFIRM_PLAIN_TOKEN);
    await writerCtx.setInputValue("#erasure-confirm-phrase", "DELETE");
    // Let React commit the controlled inputs before enabling the submit button.
    for (let i = 0; i < 20; i += 1) {
      const enabled = await writerCtx.evalFn(`(() => {
        const b = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === "Permanently delete account");
        return Boolean(b) && !b.disabled;
      })()`);
      if (enabled) break;
      await sleep(150);
    }
    await writerCtx.clickButtonByText("Permanently delete account");
    const sawErased = await writerCtx.waitForText("Account deleted", 15000);
    const erasureState = await writerCtx.evalFn(`({
      text: (document.body.innerText || "").slice(-700),
      url: location.pathname,
    })`);
    const erasedRows = await pgClient.query(
      "SELECT count(*)::int AS n FROM users WHERE email = $1",
      [QA_EMAIL],
    );
    assertCond(
      sawErased ||
        (erasureState.url === "/sign-in" && erasedRows.rows[0].n === 0),
      "erasure Step 2 confirms and permanently deletes account",
      { sawErased, url: erasureState.url, remainingQaUserRows: erasedRows.rows[0].n, text: erasureState.text },
    );

    // Telemetry checks
    assertCond(
      writerCtx.telemetry.pageErrors.length === 0 &&
        writerCtx.telemetry.thirdParty.length === 0 &&
        writerCtx.telemetry.fiveHundreds.length === 0,
      "writer browser session logged 0 page errors, 0 third-party requests, and 0 5xx responses",
      writerCtx.telemetry,
    );
    await writerCtx.dispose();
  } finally {
    const cleanStats = await cleanupQaData(pgClient);
    console.log("\n=== 7. CLEANUP VERIFICATION ===", JSON.stringify(cleanStats));
    assertCond(
      cleanStats.remainingQaUsers === 0 && cleanStats.remainingQaPubs === 0,
      "0 leftover QA users/publications in Postgres",
      cleanStats,
    );
    await pgClient.end();
    try { cdp.ws.close(); } catch {}
    try { execSync(`taskkill /F /T /PID ${chrome.pid}`, { stdio: "ignore" }); } catch {}
    try { execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" }); } catch {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n=== SUMMARY: ${failures.length} FAILURES ===`);
  if (failures.length > 0) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

await main();
