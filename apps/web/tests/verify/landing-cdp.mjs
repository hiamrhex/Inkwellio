import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createServer } from "node:net";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const WEB_DIR = path.join(REPO_ROOT, "apps/web");
const NEXT_BIN = path.join(REPO_ROOT, "node_modules/next/dist/bin/next");
const LOG_DIR = path.join(REPO_ROOT, ".logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
function assertCond(cond, label, detail) {
  if (!cond) {
    failures.push({ label, detail });
    console.error(`  [FAIL] ${label}:`, detail);
  } else {
    console.log(`  [PASS] ${label}:`, detail);
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
  const off = (method, fn) => {
    const arr = listeners.get(method);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  };
  return { ws, call, on, off };
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function percentile(nums, p) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return +sorted[idx].toFixed(2);
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
        DATABASE_URL:
          process.env.DATABASE_URL || "postgresql://postgres@localhost:55433/inkwellio",
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET || "gate-only-secret-value-0123456789abcdef",
        BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
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
      "--enable-webgl",
      "--disable-frame-rate-limit",
      "--disable-gpu-vsync",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      const v = await res.json();
      if (v?.webSocketDebuggerUrl) return { proc, wsUrl: v.webSocketDebuggerUrl };
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome CDP endpoint failed to start");
}

async function openPage(cdp, opts = {}) {
  const { browserContextId } = await cdp.call("Target.createBrowserContext", {});
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

  if (opts.width && opts.height) {
    await cdp.call(
      "Emulation.setDeviceMetricsOverride",
      {
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: opts.dpr || 1,
        mobile: !!opts.mobile,
      },
      sessionId,
    );
  }
  if (opts.hasTouch) {
    await cdp.call("Emulation.setTouchEmulationEnabled", { enabled: true }, sessionId);
  }
  if (opts.reducedMotion) {
    await cdp.call(
      "Emulation.setEmulatedMedia",
      { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
      sessionId,
    );
  }
  if (opts.throttleMobile) {
    await cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 }, sessionId);
    await cdp.call(
      "Network.emulateNetworkConditions",
      {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      },
      sessionId,
    );
  }

  const errors = { consoleErrors: [], pageErrors: [], failedReqs: [], thirdParty: [], authSubmits: 0 };
  cdp.on("Runtime.consoleAPICalled", (p, sid) => {
    if (sid === sessionId && p.type === "error") {
      errors.consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
  cdp.on("Runtime.exceptionThrown", (p, sid) => {
    if (sid === sessionId) {
      errors.pageErrors.push(p.exceptionDetails?.text || "exception");
    }
  });
  cdp.on("Network.requestWillBeSent", (p, sid) => {
    if (sid === sessionId) {
      try {
        const u = new URL(p.request.url);
        if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "127.0.0.1") {
          errors.thirdParty.push(p.request.url);
        }
        if (p.request.method === "POST" && u.pathname.startsWith("/api/auth/")) {
          errors.authSubmits += 1;
        }
      } catch {}
    }
  });
  cdp.on("Network.responseReceived", (p, sid) => {
    if (sid === sessionId && p.response.status >= 500) {
      errors.failedReqs.push({ url: p.response.url, status: p.response.status });
    }
  });

  if (!opts.skipStorageSeed) {
    await cdp.call(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source: `
          try {
            localStorage.setItem("inkwellio-theme", ${JSON.stringify(opts.theme || "dark")});
            ${opts.reducedMotion ? 'localStorage.removeItem("inkwellio-motion-paused");' : 'localStorage.setItem("inkwellio-motion-paused", "0");'}
          } catch {}
        `,
      },
      sessionId,
    );
  }

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

  const waitComplete = async () => {
    for (let i = 0; i < 80; i++) {
      if ((await evalFn("document.readyState")) === "complete") break;
      await sleep(100);
    }
  };

  const close = () => cdp.call("Target.disposeBrowserContext", { browserContextId }).catch(() => {});

  return { sessionId, errors, evalFn, waitComplete, close };
}

async function movePointer(cdp, sessionId, x, y, steps = 4, stepMs = 16) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.call(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: Math.round(x * t + (optsLastX * (1 - t))),
        y: Math.round(y * t + (optsLastY * (1 - t))),
        pointerType: "mouse",
      },
      sessionId,
    );
    if (stepMs > 0) await sleep(stepMs);
  }
  optsLastX = x;
  optsLastY = y;
}
let optsLastX = 720;
let optsLastY = 450;

async function mouseMoveAbs(cdp, sessionId, x, y) {
  await cdp.call(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", x: Math.round(x), y: Math.round(y), pointerType: "mouse" },
    sessionId,
  );
  optsLastX = x;
  optsLastY = y;
}

async function clickAt(cdp, sessionId, x, y) {
  await mouseMoveAbs(cdp, sessionId, x, y);
  await cdp.call(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 },
    sessionId,
  );
  await cdp.call(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 },
    sessionId,
  );
}

async function measureLoadOnce(cdp, port, opts = {}) {
  const { browserContextId } = await cdp.call("Target.createBrowserContext", {});
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

  if (opts.width && opts.height) {
    await cdp.call(
      "Emulation.setDeviceMetricsOverride",
      {
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: opts.dpr || 1,
        mobile: !!opts.mobile,
      },
      sessionId,
    );
  }
  if (opts.throttleMobile) {
    await cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 }, sessionId);
    await cdp.call(
      "Network.emulateNetworkConditions",
      {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      },
      sessionId,
    );
  }

  await cdp.call(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `
        try {
          localStorage.setItem("inkwellio-theme", ${JSON.stringify(opts.theme || "light")});
          localStorage.setItem("inkwellio-motion-paused", "0");
        } catch {}
        window.__diag = { cls: 0, clsEvents: [], lcp: [], longTasks: [], paints: [], fontReadyMs: 0 };
        document.fonts?.ready?.then(() => { window.__diag.fontReadyMs = Math.round(performance.now()); });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) {
            window.__diag.cls += e.value;
            window.__diag.clsEvents.push({
              val: +e.value.toFixed(4),
              t: Math.round(e.startTime),
              nodes: (e.sources || []).map(s => s.node ? (s.node.tagName + "." + s.node.className) : "null"),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            window.__diag.lcp.push({
              ms: Math.round(e.startTime),
              renderTime: Math.round(e.renderTime),
              loadTime: Math.round(e.loadTime),
              size: e.size,
              el: e.element ? (e.element.tagName + "." + e.element.className) : "",
              url: e.url || ""
            });
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            window.__diag.longTasks.push({
              start: Math.round(e.startTime),
              dur: Math.round(e.duration)
            });
          }
        }).observe({ type: "longtask", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__diag.paints.push({ name: e.name, ms: Math.round(e.startTime) });
        }).observe({ type: "paint", buffered: true });
      `,
    },
    sessionId,
  );

  const loadDone = new Promise((resolve) => {
    const onLoad = (_p, sid) => {
      if (sid === sessionId) {
        cdp.off("Page.loadEventFired", onLoad);
        resolve();
      }
    };
    cdp.on("Page.loadEventFired", onLoad);
    setTimeout(() => {
      cdp.off("Page.loadEventFired", onLoad);
      resolve();
    }, 10000);
  });

  await cdp.call(
    "Page.navigate",
    { url: `http://127.0.0.1:${port}${opts.route || "/"}` },
    sessionId,
  );

  const evalFn = async (expr) => {
    const r = await cdp.call(
      "Runtime.evaluate",
      { expression: expr, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    return r.result?.value;
  };

  await loadDone;
  await sleep(opts.throttleMobile ? 800 : 600);

  const data = await evalFn(`(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource").map(r => ({
      name: r.name.replace(location.origin, ""),
      type: r.initiatorType,
      blocking: r.renderBlockingStatus || "n/a",
      start: Math.round(r.startTime),
      respStart: Math.round(r.responseStart),
      end: Math.round(r.responseEnd),
      bytes: r.encodedBodySize || r.transferSize || 0,
    }));
    const lcp = window.__diag.lcp[window.__diag.lcp.length - 1] || null;
    const lcpRes = lcp?.url ? res.find(r => (location.origin + r.name) === lcp.url) : null;
    const ttfb = Math.round(nav.responseStart - nav.requestStart);
    const lcpTotal = lcp ? lcp.ms : 0;
    const blockingRes = res.filter(r => r.blocking === "blocking");
    const fontRes = res.filter(r => r.name.includes(".woff2") || r.name.includes("fonts"));
    const fonts = [];
    document.fonts?.forEach(f => fonts.push({ family: f.family, status: f.status, weight: f.weight }));
    return {
      ttfb,
      paints: window.__diag.paints,
      fontReadyMs: window.__diag.fontReadyMs,
      lcp,
      lcpBreakdown: {
        ttfbMs: ttfb,
        resourceLoadDelayMs: lcpRes ? Math.max(0, lcpRes.start - ttfb) : 0,
        resourceLoadTimeMs: lcpRes ? Math.max(0, lcpRes.end - lcpRes.start) : 0,
        elementRenderDelayMs: lcpRes ? Math.max(0, lcpTotal - lcpRes.end) : Math.max(0, lcpTotal - ttfb),
      },
      cls: +window.__diag.cls.toFixed(4),
      clsEvents: window.__diag.clsEvents,
      maxLongTaskMs: window.__diag.longTasks.reduce((m, t) => Math.max(m, t.dur), 0),
      blockingRes,
      fontRes,
      fontsLoaded: fonts.filter(f => f.status === "loaded").length + "/" + fonts.length,
    };
  })()`);

  await cdp.call("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  return data;
}

async function measureJsBudgets(port, route) {
  const html = await (await fetch(`http://127.0.0.1:${port}${route}`)).text();
  const scriptPaths = [
    ...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g),
  ].map((m) => m[1]);
  let firstPartyGz = 0;
  let totalGz = 0;
  for (const sp of new Set(scriptPaths)) {
    const buf = Buffer.from(await (await fetch(`http://127.0.0.1:${port}${sp}`)).arrayBuffer());
    const gz = zlib.gzipSync(buf, { level: 9 }).byteLength;
    totalGz += gz;
    const txt = buf.toString("utf8");
    const isApp =
      txt.includes("Inkwellio") ||
      txt.includes("LivingHeroArtifact") ||
      txt.includes("BentoLinkWidget") ||
      txt.includes("SignUpForm") ||
      txt.includes("SignInForm") ||
      txt.includes("ScrollChoreography");
    if (isApp) firstPartyGz += gz;
  }
  const externalScripts = {};
  for (const staticJs of ["/scripts/theme.js", "/scripts/landing-runtime.js"]) {
    if (html.includes(staticJs)) {
      const buf = Buffer.from(
        await (await fetch(`http://127.0.0.1:${port}${staticJs}`)).arrayBuffer(),
      );
      const gz = zlib.gzipSync(buf, { level: 9 }).byteLength;
      firstPartyGz += gz;
      externalScripts[staticJs] = gz;
    }
  }
  return {
    route,
    firstPartyGz,
    firstPartyKiB: +(firstPartyGz / 1024).toFixed(2),
    totalKiB: +(totalGz / 1024).toFixed(2),
    externalScripts,
  };
}

async function runPerfBenchmarks(cdp, port) {
  console.log("\n=== 1. JS BUDGETS & 5-RUN MEDIAN PERFORMANCE ===");
  const budgets = {};
  for (const r of ["/", "/sign-up", "/sign-in", "/forgot-password", "/reset-password", "/verify-email"]) {
    const b = await measureJsBudgets(port, r);
    budgets[r] = b;
    console.log(" ", b);
  }
  assertCond(budgets["/"].firstPartyGz <= 15360, "Landing first-party JS <= 15 KiB gz", `${budgets["/"].firstPartyKiB} KiB (${budgets["/"].firstPartyGz} B)`);
  assertCond(
    (budgets["/"].externalScripts["/scripts/landing-runtime.js"] || 0) <= 3072,
    "landing-runtime.js <= 3072 B gz",
    `${budgets["/"].externalScripts["/scripts/landing-runtime.js"]} B`,
  );

  const summarize = (label, runs) => {
    const lcps = runs.map((r) => r.lcp?.ms || 0);
    const lts = runs.map((r) => r.maxLongTaskMs);
    const fcps = runs.map((r) => r.paints.find((p) => p.name === "first-contentful-paint")?.ms || 0);
    const out = {
      medianFcp: median(fcps),
      medianLcp: median(lcps),
      medianMaxLongTask: median(lts),
      medianCls: Math.max(...runs.map((r) => r.cls)),
      breakdown: {
        ttfb: median(runs.map((r) => r.lcpBreakdown.ttfbMs)),
        resourceLoadDelay: median(runs.map((r) => r.lcpBreakdown.resourceLoadDelayMs)),
        resourceLoadTime: median(runs.map((r) => r.lcpBreakdown.resourceLoadTimeMs)),
        elementRenderDelay: median(runs.map((r) => r.lcpBreakdown.elementRenderDelayMs)),
      },
      allLcps: lcps,
      elements: runs.map((r) => r.lcp?.el),
      fontsLoaded: runs[0].fontsLoaded,
      blockingCount: runs[0].blockingRes.length,
      blockingNames: runs[0].blockingRes.map((r) => r.name),
      clsEvents: runs.flatMap((r) => r.clsEvents).slice(0, 6),
    };
    console.log(`  ${label}:`, JSON.stringify(out));
    return out;
  };

  const mobileRuns = [];
  for (let i = 0; i < 5; i++) {
    mobileRuns.push(
      await measureLoadOnce(cdp, port, {
        width: 390,
        height: 844,
        dpr: 2,
        mobile: true,
        throttleMobile: true,
        theme: "light",
      }),
    );
  }
  const desktopDarkRuns = [];
  for (let i = 0; i < 5; i++) {
    desktopDarkRuns.push(await measureLoadOnce(cdp, port, { width: 1440, height: 900, theme: "dark" }));
  }
  const desktopLightRuns = [];
  for (let i = 0; i < 5; i++) {
    desktopLightRuns.push(await measureLoadOnce(cdp, port, { width: 1440, height: 900, theme: "light" }));
  }

  const mSum = summarize("Mobile 390x844 (4x CPU, Light)", mobileRuns);
  const ddSum = summarize("Desktop 1440x900 (Dark)", desktopDarkRuns);
  const dlSum = summarize("Desktop 1440x900 (Light)", desktopLightRuns);
  assertCond(mSum.medianLcp <= 2300, "Mobile 5-run median LCP <= 2300ms", `${mSum.medianLcp} ms`);
  assertCond(ddSum.medianLcp <= 1200, "Desktop Dark median LCP <= 1200ms", `${ddSum.medianLcp} ms`);
  assertCond(dlSum.medianLcp <= 1200, "Desktop Light median LCP <= 1200ms", `${dlSum.medianLcp} ms`);
  assertCond(mSum.medianCls <= 0.1 && ddSum.medianCls <= 0.1, "CLS <= 0.1 across profiles", { m: mSum.medianCls, dd: ddSum.medianCls });
  assertCond(ddSum.blockingCount <= 2 && ddSum.blockingNames.every((n) => n.endsWith(".css") || n === "/scripts/theme.js"), "Only layout CSS & theme.js render-blocking (0 unexpected)", ddSum.blockingNames);
}

async function runRoutesAudit(cdp, port) {
  console.log("\n=== 2. 10 PUBLIC ROUTES OVERFLOW, ERRORS & SHELL TARGETS ===");
  const routes = ["/", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/privacy", "/terms", "/topics", "/search"];
  for (const vp of [
    { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false },
    { name: "mobile", width: 390, height: 844, dpr: 2, mobile: true },
  ]) {
    for (const route of routes) {
      const page = await openPage(cdp, { ...vp, theme: "dark" });
      await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}${route}` }, page.sessionId);
      await page.waitComplete();
      await sleep(300);
      const metrics = await page.evalFn(`(() => {
        const doc = document.documentElement;
        const header = document.querySelector(".site-header-bar");
        const footer = document.querySelector(".site-footer");
        const bodyStyle = getComputedStyle(document.body);
        const h1 = document.querySelector("h1");
        const h1Style = h1 ? getComputedStyle(h1) : null;
        const themeBtn = document.querySelector("[data-theme-toggle]");
        const motionBtn = document.querySelector(".site-footer [data-motion-toggle]");
        const tRect = themeBtn ? themeBtn.getBoundingClientRect() : null;
        const mRect = motionBtn ? motionBtn.getBoundingClientRect() : null;
        const headerMotionCount = document.querySelectorAll("header [data-motion-toggle]").length;
        const footerMotionCount = document.querySelectorAll(".site-footer [data-motion-toggle]").length;
        const marketingAnchors = [...document.querySelectorAll("header a")].filter((a) =>
          ["Principles", "Editor", "Reading", "Publishing"].includes(a.textContent.trim()),
        ).length;
        const img = document.querySelector(".hero-ribbon-img");
        return {
          overflowX: doc.scrollWidth - window.innerWidth,
          headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
          footerH: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
          bodyFontPx: parseFloat(bodyStyle.fontSize),
          h1FontPx: h1Style ? parseFloat(h1Style.fontSize) : 0,
          themeBtnBox: tRect ? [Math.round(tRect.width), Math.round(tRect.height)] : null,
          motionBtnBox: mRect ? [Math.round(mRect.width), Math.round(mRect.height)] : null,
          headerMotionCount,
          footerMotionCount,
          marketingAnchors,
          heroImgSrc: img ? img.currentSrc || img.getAttribute("src") : null,
        };
      })()`);
      assertCond(
        metrics.overflowX <= 1,
        `${vp.name} ${route} no horizontal overflow`,
        `overflowX=${metrics.overflowX}px`,
      );
      assertCond(
        page.errors.consoleErrors.length === 0 &&
          page.errors.pageErrors.length === 0 &&
          page.errors.failedReqs.length === 0 &&
          page.errors.thirdParty.length === 0,
        `${vp.name} ${route} zero errors & zero third-party reqs`,
        page.errors,
      );
      assertCond(
        metrics.headerH > 0 && metrics.headerH <= 64,
        `${vp.name} ${route} header height <= 64px`,
        `${metrics.headerH}px`,
      );
      assertCond(
        metrics.headerMotionCount === 0,
        `${vp.name} ${route} zero motion toggles in header`,
        `${metrics.headerMotionCount}`,
      );
      assertCond(
        metrics.footerMotionCount === 1 &&
          metrics.motionBtnBox &&
          metrics.motionBtnBox[0] >= 44 &&
          metrics.motionBtnBox[1] >= 44,
        `${vp.name} ${route} single footer motion toggle >= 44x44`,
        metrics.motionBtnBox,
      );
      assertCond(
        route === "/" ? metrics.marketingAnchors === 4 : metrics.marketingAnchors === 0,
        `${vp.name} ${route} marketing anchors only on /`,
        `${metrics.marketingAnchors}`,
      );
      if (metrics.themeBtnBox) {
        assertCond(
          metrics.themeBtnBox[0] >= 44 && metrics.themeBtnBox[1] >= 44,
          `${vp.name} ${route} theme toggle >= 44x44`,
          { theme: metrics.themeBtnBox },
        );
      }
      if (vp.mobile && route === "/") {
        assertCond(metrics.bodyFontPx >= 16, "Mobile body font >= 16px", `${metrics.bodyFontPx}px`);
        assertCond(
          (metrics.heroImgSrc || "").includes("-mobile.webp"),
          "Mobile / loads -mobile.webp variant",
          metrics.heroImgSrc,
        );
      }
      await page.close();
    }
  }
}

async function runLandingPointerPhysics(cdp, port) {
  console.log("\n=== 3. LANDING (/) POINTER PHYSICS, IDLE STOP, TOUCH & FRAME BUDGET ===");
  const page = await openPage(cdp, { width: 1440, height: 900, theme: "dark" });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}/` }, page.sessionId);
  await page.waitComplete();
  await sleep(600);

  // Move pointer from top-left hero to bottom-right hero -> measure ribbon delta & card tilt
  await movePointer(cdp, page.sessionId, 60, 120, 4, 16);
  await sleep(650);
  const stateA = await page.evalFn(`(() => {
    const rb = document.querySelector(".hero-ribbon-media-box");
    const rs = rb ? getComputedStyle(rb) : null;
    const p = window.__inkwellioPointer || {};
    return {
      rx: parseFloat(rb?.style.getPropertyValue("--rx") || p.rx || 0),
      ry: parseFloat(rb?.style.getPropertyValue("--ry") || p.ry || 0),
      rbTransform: rs?.transform,
    };
  })()`);

  // Hover margin inside hero (right of card, away from buttons)
  const heroMarginPt = await page.evalFn(`(() => {
    const card = document.querySelector("[data-tilt-hero]");
    const outer = document.querySelector(".hero-stage-outer");
    const r = outer.getBoundingClientRect();
    const cr = card ? card.getBoundingClientRect() : null;
    return { x: Math.min(1420, Math.round((cr ? cr.right : r.right - 80) + 16)), y: Math.round(r.top + 130) };
  })()`);
  await movePointer(cdp, page.sessionId, 1380, heroMarginPt.y, 6, 16);
  await sleep(650);
  const stateB = await page.evalFn(`(() => {
    const rb = document.querySelector(".hero-ribbon-media-box");
    const card = document.querySelector("[data-tilt-hero]");
    const body = document.querySelector(".hero-form-body");
    const outer = document.querySelector(".hero-stage-outer");
    const spot = document.querySelector(".hero-cursor-spotlight");
    const or = outer.getBoundingClientRect();
    const p = window.__inkwellioPointer || {};
    const csBody = body ? getComputedStyle(body) : null;
    const m = csBody && csBody.transform !== "none" ? new DOMMatrix(csBody.transform) : null;
    const rxDeg = m ? Math.abs(Math.atan2(m.m23, m.m22) * 180 / Math.PI) : 0;
    const ryDeg = m ? Math.abs(Math.atan2(m.m31, m.m11) * 180 / Math.PI) : 0;
    return {
      rx: parseFloat(rb?.style.getPropertyValue("--rx") || p.rx || 0),
      ry: parseFloat(rb?.style.getPropertyValue("--ry") || p.ry || 0),
      tx: parseFloat(card?.style.getPropertyValue("--tx") || p.tx || 0),
      ty: parseFloat(card?.style.getPropertyValue("--ty") || p.ty || 0),
      domDeg: +Math.hypot(rxDeg, ryDeg).toFixed(2),
      spotOpacity: spot ? parseFloat(getComputedStyle(spot).opacity) : 0,
      cursorX: parseFloat(outer?.style.getPropertyValue("--cursor-x") || 0),
      cursorY: parseFloat(outer?.style.getPropertyValue("--cursor-y") || 0),
      outerTop: or.top,
      outerLeft: or.left,
    };
  })()`);
  const ribbonDelta = +Math.hypot(stateB.rx - stateA.rx, stateB.ry - stateA.ry).toFixed(1);
  const heroTiltMag = +Math.hypot(stateB.tx, stateB.ty).toFixed(2);
  const spotErr = +Math.hypot(stateB.cursorX - (1380 - stateB.outerLeft), stateB.cursorY - (heroMarginPt.y - stateB.outerTop)).toFixed(1);
  assertCond(ribbonDelta >= 55, "Hero ribbon pointer delta >= 55px", `${ribbonDelta}px`);
  assertCond(heroTiltMag >= 6 && heroTiltMag <= 10.2, "Hero card tilt magnitude in 6°-10°", { varDeg: heroTiltMag, domDeg: stateB.domDeg, tx: stateB.tx, ty: stateB.ty });
  assertCond(stateB.spotOpacity > 0.8 && spotErr <= 24, "Hero cursor spotlight <= 24px lag", { opacity: stateB.spotOpacity, errPx: spotErr });

  // Wait 1.2s + 400ms settle -> verify <= 0.5° tilt and 0 idle rAF callbacks
  await sleep(1650);
  const idleCheck = await page.evalFn(`new Promise((resolve) => {
    const card = document.querySelector("[data-tilt-hero]");
    const tx = Math.abs(parseFloat(card?.style.getPropertyValue("--tx") || 0));
    const ty = Math.abs(parseFloat(card?.style.getPropertyValue("--ty") || 0));
    const activeAtStart = !!window.__inkwellioPointer?.active;
    const snap = JSON.stringify([window.__inkwellioPointer?.curX, window.__inkwellioPointer?.tx, window.__inkwellioPointer?.rx]);
    setTimeout(() => {
      const after = JSON.stringify([window.__inkwellioPointer?.curX, window.__inkwellioPointer?.tx, window.__inkwellioPointer?.rx]);
      resolve({ tx, ty, activeAtStart, changedDuringIdle: snap !== after, stillActive: !!window.__inkwellioPointer?.active });
    }, 400);
  })`);
  assertCond(
    idleCheck.tx <= 0.5 && idleCheck.ty <= 0.5 && !idleCheck.changedDuringIdle && !idleCheck.stillActive,
    "Hero idle 1.2s+400ms flattens <= 0.5° and stops rAF",
    idleCheck,
  );

  // Focus input inside hero card -> tilt stays <= 0.5° while cursor light keeps tracking!
  await page.evalFn(`(() => {
    const trigger = document.querySelector('[data-tilt-hero] [role="button"]');
    if (trigger) trigger.click();
  })()`);
  await sleep(120);
  await page.evalFn(`document.querySelector('[data-tilt-hero] input, [data-tilt-hero] textarea')?.focus()`);
  await movePointer(cdp, page.sessionId, 320, 280, 4, 16);
  await sleep(550);
  const focusCheck = await page.evalFn(`(() => {
    const card = document.querySelector("[data-tilt-hero]");
    const outer = document.querySelector(".hero-stage-outer");
    const or = outer.getBoundingClientRect();
    return {
      activeTag: document.activeElement?.tagName,
      tx: Math.abs(parseFloat(card?.style.getPropertyValue("--tx") || 0)),
      ty: Math.abs(parseFloat(card?.style.getPropertyValue("--ty") || 0)),
      errPx: +Math.hypot(
        parseFloat(outer?.style.getPropertyValue("--cursor-x") || 0) - (320 - or.left),
        parseFloat(outer?.style.getPropertyValue("--cursor-y") || 0) - (280 - or.top),
      ).toFixed(1),
    };
  })()`);
  assertCond(
    focusCheck.activeTag === "TEXTAREA" && focusCheck.tx <= 0.5 && focusCheck.ty <= 0.5 && focusCheck.errPx <= 24,
    "Hero focus-input flattens tilt <= 0.5° & keeps cursor spotlight alive",
    focusCheck,
  );
  await page.evalFn(`document.activeElement?.blur?.()`);

  // Magnetic button pull vs non-magnetic button stability
  await page.evalFn(`window.scrollTo(0, 0)`);
  await sleep(200);
  const magBefore = await page.evalFn(`(() => {
    const mag = document.querySelector(".hero-cta-row .magnetic-btn");
    const r = mag.getBoundingClientRect();
    return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  })()`);
  await movePointer(cdp, page.sessionId, magBefore.cx + 18, magBefore.cy + 8, 4, 16);
  await sleep(350);
  const magAfter = await page.evalFn(`(() => {
    const mag = document.querySelector(".hero-cta-row .magnetic-btn");
    const lbl = mag.querySelector(".mag-label");
    const r = mag.getBoundingClientRect();
    return {
      boxShift: +Math.hypot(r.left - ${magBefore.left}, r.top - ${magBefore.top}).toFixed(2),
      magX: parseFloat(mag.style.getPropertyValue("--mag-x") || 0),
      magLx: parseFloat(mag.style.getPropertyValue("--mag-lx") || 0),
      hasLabel: !!lbl,
    };
  })()`);
  assertCond(magAfter.boxShift >= 2 && magAfter.hasLabel, "Hero magnetic CTA pulls toward pointer", magAfter);

  // Scroll to Bento card with pill buttons, wait for reveal settle, then capture stable button baseline
  await page.evalFn(`(() => {
    const btn = document.querySelector(".essential-card.bento-specular-card .bento-pill-btn");
    const card = btn.closest(".essential-card.bento-specular-card");
    card.scrollIntoView({ block: "center", behavior: "instant" });
  })()`);
  await sleep(600);
  const bentoInfo = await page.evalFn(`(() => {
    const btn = document.querySelector(".essential-card.bento-specular-card .bento-pill-btn");
    const card = btn.closest(".essential-card.bento-specular-card");
    const cr = card.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    return {
      cr: { left: cr.left, top: cr.top, right: cr.right, width: cr.width, height: cr.height },
      br: { left: br.left, top: br.top, width: br.width, height: br.height },
    };
  })()`);
  await movePointer(cdp, page.sessionId, bentoInfo.cr.right - 22, bentoInfo.cr.top + 22, 4, 16);
  await sleep(350);
  const bentoHover = await page.evalFn(`(() => {
    const btn = document.querySelector(".essential-card.bento-specular-card .bento-pill-btn");
    const card = btn.closest(".essential-card.bento-specular-card");
    return {
      sx: parseFloat(card.style.getPropertyValue("--sx") || 0),
      sy: parseFloat(card.style.getPropertyValue("--sy") || 0),
      spotX: parseFloat(card.style.getPropertyValue("--spotlight-x") || -999),
      transform: getComputedStyle(card).transform,
    };
  })()`);
  assertCond(
    (Math.abs(bentoHover.sx) > 0.5 || Math.abs(bentoHover.sy) > 0.5) && bentoHover.spotX > 0 && bentoHover.transform !== "none",
    "Bento card hover triggers 3D tilt, lift, and rim spotlight",
    bentoHover,
  );
  // Check non-magnetic .bento-pill-btn hover stability (hover center then edge -> <= 1.5px)
  await movePointer(cdp, page.sessionId, bentoInfo.br.left + bentoInfo.br.width / 2, bentoInfo.br.top + bentoInfo.br.height / 2, 3, 16);
  await sleep(250);
  const bentoBtnBefore = await page.evalFn(`(() => {
    const r = document.querySelector(".essential-card.bento-specular-card .bento-pill-btn").getBoundingClientRect();
    return { left: r.left, top: r.top };
  })()`);
  await movePointer(cdp, page.sessionId, bentoInfo.br.left + 6, bentoInfo.br.top + 6, 3, 16);
  await sleep(250);
  const bentoBtnAfter = await page.evalFn(`(() => {
    const btn = document.querySelector(".essential-card.bento-specular-card .bento-pill-btn");
    const r = btn.getBoundingClientRect();
    return { move: +Math.max(Math.abs(r.left - ${bentoBtnBefore.left}), Math.abs(r.top - ${bentoBtnBefore.top})).toFixed(2) };
  })()`);
  assertCond(bentoBtnAfter.move <= 1.5, "Non-magnetic Bento button hit-box moves <= 1.5px", bentoBtnAfter);

  // Desktop Frame budget sweep (pointer sweep at top after instant scroll restore & settle)
  await page.evalFn(`window.scrollTo({ top: 0, behavior: "instant" })`);
  await sleep(450);
  await movePointer(cdp, page.sessionId, 200, 160, 2, 16);
  await sleep(100);
  await page.evalFn(`(() => {
    window.__frames = [];
    window.__rec = true;
    let last = performance.now();
    function loop(now) {
      const dt = now - last;
      last = now;
      window.__frames.push(dt);
      if (window.__rec) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })()`);
  for (let i = 0; i < 40; i++) {
    await mouseMoveAbs(cdp, page.sessionId, 200 + (i % 20) * 55, 160 + (i % 5) * 90);
    await sleep(16);
  }
  await sleep(100);
  const deskFrames = await page.evalFn(`(() => { window.__rec = false; return window.__frames.slice(2); })()`);
  const deskJsDur = await page.evalFn(`new Promise((resolve) => {
    const out = [];
    let k = 0;
    function step() {
      const t0 = performance.now();
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 200 + (k % 20) * 50, clientY: 180 + (k % 5) * 80, pointerType: "mouse", bubbles: true }));
      out.push(+(performance.now() - t0).toFixed(2));
      k += 1;
      if (k < 25) requestAnimationFrame(step);
      else resolve(out);
    }
    requestAnimationFrame(step);
  })`);
  const medDesk = percentile(deskFrames, 50);
  const p95Desk = percentile(deskFrames, 95);
  const p95DeskJs = percentile(deskJsDur, 95);
  assertCond(
    medDesk <= 17 && p95Desk <= 34 && p95DeskJs <= 4,
    "Desktop frame budget (med <= 17ms, p95 <= 34ms software-headless ceiling, JS p95 <= 4ms)",
    { count: deskFrames.length, medDesk, p95Desk, p95DeskJs },
  );

  await page.close();

  // 4x CPU mobile frame budget check (let lazy ribbon finish, then run native smooth scroll)
  const mPage = await openPage(cdp, { width: 390, height: 844, dpr: 2, mobile: true, throttleMobile: true, theme: "dark" });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}/` }, mPage.sessionId);
  await mPage.waitComplete();
  await sleep(3200);
  const mobMetrics = await mPage.evalFn(`new Promise((resolve) => {
    const out = [];
    const js = [];
    let last = performance.now();
    function loop(now) {
      const t0 = performance.now();
      out.push(+(now - last).toFixed(1));
      last = now;
      js.push(+(performance.now() - t0).toFixed(2));
      if (out.length < 22) requestAnimationFrame(loop);
      else resolve({ frames: out.slice(2), js: js.slice(2), endY: Math.round(window.scrollY) });
    }
    window.scrollBy({ top: 360, behavior: "smooth" });
    requestAnimationFrame(loop);
  })`);
  const p95Mob = percentile(mobMetrics.frames, 95);
  const p95MobJs = percentile(mobMetrics.js, 95);
  assertCond(
    p95Mob <= 50 && p95MobJs <= 20 && mobMetrics.endY >= 150,
    "4x CPU mobile scroll frame p95 <= 50ms & JS <= 20ms",
    { count: mobMetrics.frames.length, p95Mob, p95MobJs, endY: mobMetrics.endY },
  );
  await mPage.close();

  // Touch device check (390x844 hasTouch)
  const tPage = await openPage(cdp, { width: 390, height: 844, dpr: 2, mobile: true, hasTouch: true, theme: "dark" });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}/` }, tPage.sessionId);
  await tPage.waitComplete();
  await sleep(400);
  await cdp.call(
    "Input.dispatchTouchEvent",
    { type: "touchStart", touchPoints: [{ x: 180, y: 240, id: 1 }] },
    tPage.sessionId,
  );
  await cdp.call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, tPage.sessionId);
  await sleep(250);
  const touchState = await tPage.evalFn(`(() => {
    const p = window.__inkwellioPointer || {};
    return { tx: p.tx || 0, ty: p.ty || 0, rx: p.rx || 0 };
  })()`);
  assertCond(touchState.tx === 0 && touchState.rx === 0, "Touch device disables hover tilt & ribbon pointer drag", touchState);
  await tPage.close();
}

async function runScrollChoreography(cdp, port) {
  console.log("\n=== 4. SCROLL CHOREOGRAPHY (HERO 3-RATE EXIT, #post-life 360vh, #writer-reader) ===");
  const page = await openPage(cdp, { width: 1440, height: 900, theme: "dark" });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}/` }, page.sessionId);
  await page.waitComplete();
  await sleep(600);

  // Hero 3-rate exit at scrollY = 480
  await page.evalFn(`window.scrollTo({ top: 480, behavior: "instant" })`);
  await sleep(250);
  const heroExit = await page.evalFn(`(() => {
    const getTy = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 0;
      const tr = getComputedStyle(el).transform;
      if (!tr || tr === "none") return 0;
      return +new DOMMatrix(tr).m42.toFixed(2);
    };
    const copyTy = getTy(".hero-copy");
    const cardTy = getTy(".hero-form-body");
    const ribTy = getTy(".hero-silk-backdrop");
    return {
      scroll: document.querySelector(".hero-copy")?.style.getPropertyValue("--hero-scroll"),
      copyTy,
      cardTy,
      ribTy,
      d1: +Math.abs(copyTy - cardTy).toFixed(2),
      d2: +Math.abs(copyTy - ribTy).toFixed(2),
      d3: +Math.abs(cardTy - ribTy).toFixed(2),
    };
  })()`);
  assertCond(
    heroExit.d1 >= 40 && heroExit.d2 >= 40 && heroExit.d3 >= 40,
    "Hero scrollY=480 3-rate separation >= 40px pairwise",
    heroExit,
  );

  // #post-life pinned runway notches + horizontal travel + dot click
  const trackInfo = await page.evalFn(`(() => {
    const track = document.querySelector(".post-life-track");
    const r = track.getBoundingClientRect();
    return {
      trackTop: Math.round(r.top + window.scrollY),
      trackH: Math.round(r.height),
      vh: window.innerHeight,
    };
  })()`);
  const travelV = trackInfo.trackH - trackInfo.vh;
  const maxNotches = Math.ceil(travelV / 100);
  assertCond(maxNotches <= 44, "#post-life total 100px notches <= 44", { travelV, maxNotches });

  await page.evalFn(`window.scrollTo({ top: ${trackInfo.trackTop}, behavior: "instant" })`);
  await sleep(350);
  const reelStart = await page.evalFn(`(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector(".post-life-reel")).transform);
    return m.m41;
  })()`);

  const stageNotches = [0, 0, 0, 0];
  const plateauCounts = [0, 0, 0, 0];
  let prevX = null;
  for (let i = 0; i <= maxNotches; i++) {
    const snap = await page.evalFn(`(() => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector(".post-life-reel")).transform);
      const sec = document.querySelector("#post-life");
      const rawStage = parseFloat(sec?.style.getPropertyValue("--post-life-stage") || "0");
      return { x: m.m41, activeIdx: document.querySelector(".post-life-panel[data-stage-active='true']")?.getAttribute("data-post-life-panel") };
    })()`);
    const st = Number(snap.activeIdx);
    if (Number.isInteger(st) && st >= 0 && st < 4) {
      stageNotches[st] += 1;
      if (prevX !== null && Math.abs(snap.x - prevX) < 1.5) plateauCounts[st] += 1;
    }
    prevX = snap.x;
    await cdp.call(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", x: 720, y: 450, deltaX: 0, deltaY: 100 },
      page.sessionId,
    );
    await sleep(35);
  }
  await sleep(250);
  const reelEnd = await page.evalFn(`(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector(".post-life-reel")).transform);
    return m.m41;
  })()`);
  const horizTravel = +Math.abs(reelEnd - reelStart).toFixed(1);
  assertCond(horizTravel >= 1100, "#post-life horizontal travel >= 1100px", { reelStart: +reelStart.toFixed(1), reelEnd: +reelEnd.toFixed(1), horizTravel });
  assertCond(
    stageNotches.every((n) => n >= 3),
    "#post-life holds >= 3 notches per stage (0..3)",
    { stageNotches, plateauCounts },
  );

  // Click stage dot 1 -> scrolls cleanly to stage 1
  const dot1 = await page.evalFn(`(() => {
    const d = document.querySelector('[data-post-life-dot="1"]');
    const r = d.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  assertCond(dot1.w >= 44 && dot1.h >= 44, "#post-life dot hit target >= 44x44", dot1);
  await clickAt(cdp, page.sessionId, dot1.x, dot1.y);
  await sleep(900);
  const afterDot = await page.evalFn(`document.querySelector('.post-life-panel[data-stage-active="true"]')?.getAttribute('data-post-life-panel')`);
  assertCond(afterDot === "1", "Clicking dot 1 navigates to stage 1", afterDot);

  // #writer-reader side glide: entry near bottom vs settled center
  const sideInfo = await page.evalFn(`(() => {
    const s = document.querySelector("#writer-reader");
    const r = s.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), vh: window.innerHeight };
  })()`);
  // Entry just below fold -> progress ~ 0
  await page.evalFn(`window.scrollTo(0, ${Math.max(0, sideInfo.top - sideInfo.vh + 24)})`);
  await sleep(250);
  const sideStart = await page.evalFn(`(() => {
    const read = (sel) => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector(sel)).transform);
      return {
        tx: +m.m41.toFixed(1),
        ry: +(Math.atan2(m.m31, m.m11) * 180 / Math.PI).toFixed(2),
        scale: +Math.hypot(m.m11, m.m12, m.m13).toFixed(3),
      };
    };
    return { left: read(".side-glide-left"), right: read(".side-glide-right") };
  })()`);
  await page.evalFn(`window.scrollTo(0, ${Math.max(0, sideInfo.top - 120)})`);
  await sleep(300);
  const sideSettled = await page.evalFn(`(() => {
    const read = (sel) => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector(sel)).transform);
      return {
        tx: +m.m41.toFixed(1),
        ry: +(Math.atan2(m.m31, m.m11) * 180 / Math.PI).toFixed(2),
        scale: +Math.hypot(m.m11, m.m12, m.m13).toFixed(3),
      };
    };
    return { left: read(".side-glide-left"), right: read(".side-glide-right") };
  })()`);
  assertCond(
    Math.abs(sideStart.left.tx) >= 150 &&
      Math.abs(sideStart.right.tx) >= 150 &&
      Math.abs(sideStart.left.ry) >= 8 &&
      Math.abs(sideStart.right.ry) >= 8,
    "#writer-reader starts |tx| >= 150px and |rotateY| >= 8°",
    sideStart,
  );
  assertCond(
    Math.abs(sideSettled.left.tx) <= 2 &&
      Math.abs(sideSettled.right.tx) <= 2 &&
      Math.abs(sideSettled.left.ry) <= 0.5 &&
      Math.abs(sideSettled.left.scale - 1) <= 0.01,
    "#writer-reader converges to identity",
    sideSettled,
  );

  await page.close();
}

async function runSignUpAuthChecks(cdp, port) {
  console.log("\n=== 5. /sign-up AUTH MOTION, STATIONARY SUBMIT & CARRY-OVER ===");
  const page = await openPage(cdp, { width: 1440, height: 900, theme: "dark" });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}/sign-up` }, page.sessionId);
  await page.waitComplete();
  await sleep(600);

  // Move pointer to top-left corner vs bottom-right corner -> check backdrop delta & zero exposed edges
  await movePointer(cdp, page.sessionId, 20, 40, 4, 16);
  await sleep(650);
  const authA = await page.evalFn(`(() => {
    const ab = document.querySelector("[data-auth-parallax]");
    const am = document.querySelector(".auth-main").getBoundingClientRect();
    const abr = ab.getBoundingClientRect();
    const img = document.querySelector(".auth-spatial-img")?.getBoundingClientRect();
    const p = window.__inkwellioPointer || {};
    return {
      abx: p.abx || 0,
      aby: p.aby || 0,
      bgCovered: abr.left <= am.left && abr.right >= am.right && abr.top <= am.top && abr.bottom >= am.bottom,
      imgCovered: !img || (img.left <= am.left && img.right >= am.right && img.top <= am.top && img.bottom >= am.bottom),
    };
  })()`);

  await movePointer(cdp, page.sessionId, 1410, 860, 6, 16);
  await sleep(650);
  const authB = await page.evalFn(`(() => {
    const ab = document.querySelector("[data-auth-parallax]");
    const am = document.querySelector(".auth-main").getBoundingClientRect();
    const abr = ab.getBoundingClientRect();
    const img = document.querySelector(".auth-spatial-img")?.getBoundingClientRect();
    const p = window.__inkwellioPointer || {};
    return {
      abx: p.abx || 0,
      aby: p.aby || 0,
      bgCovered: abr.left <= am.left && abr.right >= am.right && abr.top <= am.top && abr.bottom >= am.bottom,
      imgCovered: !img || (img.left <= am.left && img.right >= am.right && img.top <= am.top && img.bottom >= am.bottom),
    };
  })()`);
  const abDelta = +Math.hypot(authB.abx - authA.abx, authB.aby - authA.aby).toFixed(1);
  assertCond(abDelta >= 35, "/sign-up backdrop parallax delta >= 35px", `${abDelta}px`);
  assertCond(authA.bgCovered && authA.imgCovered && authB.bgCovered && authB.imgCovered, "/sign-up zero exposed parallax edges", { authA, authB });

  // Margin tilt in 4°-7° (mouse in outer margin away from inputs/buttons)
  await movePointer(cdp, page.sessionId, 1320, 140, 4, 16);
  await sleep(650);
  const authMargin = await page.evalFn(`(() => {
    const card = document.querySelector("[data-tilt-auth]");
    const am = document.querySelector(".auth-main");
    const spot = document.querySelector(".auth-cursor-spotlight");
    const r = am.getBoundingClientRect();
    const p = window.__inkwellioPointer || {};
    return {
      atx: p.atx || 0,
      aty: p.aty || 0,
      deg: +Math.hypot(p.atx || 0, p.aty || 0).toFixed(2),
      spotOpacity: spot ? parseFloat(getComputedStyle(spot).opacity) : 0,
      cursorErr: +Math.hypot(
        parseFloat(am.style.getPropertyValue("--cursor-x") || 0) - (1320 - r.left),
        parseFloat(am.style.getPropertyValue("--cursor-y") || 0) - (140 - r.top),
      ).toFixed(1),
    };
  })()`);
  assertCond(authMargin.deg >= 4 && authMargin.deg <= 7.2, "/sign-up margin card tilt 4°-7°", authMargin);
  assertCond(authMargin.spotOpacity > 0.8 && authMargin.cursorErr <= 24, "/sign-up cursor light follows <= 24px", authMargin);

  // Move onto email input -> flattens <= 0.5° within 200ms!
  const authCtrls = await page.evalFn(`(() => {
    const inp = document.querySelector("#sign-up-email");
    const sub = document.querySelector(".auth-submit");
    const ir = inp.getBoundingClientRect();
    const sr = sub.getBoundingClientRect();
    return {
      ix: Math.round(ir.left + ir.width / 2),
      iy: Math.round(ir.top + ir.height / 2),
      sx: Math.round(sr.left + sr.width / 2),
      sy: Math.round(sr.top + sr.height / 2),
      subRightEdgeX: Math.round(sr.right - 24),
      subTopEdgeY: Math.round(sr.top + 8),
    };
  })()`);
  await mouseMoveAbs(cdp, page.sessionId, authCtrls.ix, authCtrls.iy);
  await sleep(200);
  const hoverInputFlat = await page.evalFn(`(() => {
    const p = window.__inkwellioPointer || {};
    return { atx: +(p.atx || 0).toFixed(2), aty: +(p.aty || 0).toFixed(2) };
  })()`);
  assertCond(Math.abs(hoverInputFlat.atx) <= 0.5 && Math.abs(hoverInputFlat.aty) <= 0.5, "/sign-up flattens <= 0.5° within 200ms over input", hoverInputFlat);

  // Move to dead-center of stationary .auth-submit (0° card), then hover off-center -> rect moves <= 1.5px!
  await mouseMoveAbs(cdp, page.sessionId, authCtrls.sx, authCtrls.sy);
  await sleep(220);
  const subBefore = await page.evalFn(`(() => {
    const sr = document.querySelector(".auth-submit").getBoundingClientRect();
    return { left: sr.left, top: sr.top, w: sr.width, h: sr.height };
  })()`);
  await mouseMoveAbs(cdp, page.sessionId, authCtrls.subRightEdgeX, authCtrls.subTopEdgeY);
  await sleep(250);
  const subAfter = await page.evalFn(`(() => {
    const el = document.querySelector(".auth-submit");
    const sr = el.getBoundingClientRect();
    return {
      move: +Math.max(
        Math.abs(sr.left - ${subBefore.left}),
        Math.abs(sr.top - ${subBefore.top}),
        Math.abs(sr.width - ${subBefore.w}),
        Math.abs(sr.height - ${subBefore.h}),
      ).toFixed(2),
      magX: el.style.getPropertyValue("--mag-x") || "0px",
    };
  })()`);
  assertCond(subAfter.move <= 1.5, "/sign-up submit button rect moves <= 1.5px", subAfter);

  // Password eye toggle >= 44x44 and submits === 0 + dark input color
  const eyeInfo = await page.evalFn(`(() => {
    const inp = document.querySelector("#sign-up-password");
    const btn = document.querySelector(".auth-password-toggle");
    const r = btn.getBoundingClientRect();
    const cs = getComputedStyle(inp);
    return {
      typeBefore: inp.type,
      w: Math.round(r.width),
      h: Math.round(r.height),
      cx: Math.round(r.left + r.width / 2),
      cy: Math.round(r.top + r.height / 2),
      bg: cs.backgroundColor,
    };
  })()`);
  await clickAt(cdp, page.sessionId, eyeInfo.cx, eyeInfo.cy);
  await sleep(150);
  const eyeAfter = await page.evalFn(`document.querySelector("#sign-up-password").type`);
  assertCond(eyeInfo.w >= 44 && eyeInfo.h >= 44 && eyeInfo.typeBefore === "password" && eyeAfter === "text" && page.errors.authSubmits === 0, "/sign-up 44x44 eye toggle reveals without submit", { ...eyeInfo, eyeAfter, authSubmits: page.errors.authSubmits });
  assertCond(eyeInfo.bg === "rgb(13, 15, 20)", "/sign-up dark input background is #0d0f14", eyeInfo.bg);

  await page.close();
}

async function runReducedMotionAndScreenshots(cdp, port) {
  console.log("\n=== 6. REDUCED MOTION, KEYBOARD MOTION TOGGLE & SCREENSHOTS ===");
  const page = await openPage(cdp, { width: 1440, height: 900, theme: "dark", reducedMotion: true });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}/` }, page.sessionId);
  await page.waitComplete();
  await sleep(500);

  await page.evalFn(`window.scrollTo({ top: 480, behavior: "instant" })`);
  await sleep(200);
  const rmPaused = await page.evalFn(`(() => {
    const tr = getComputedStyle(document.querySelector(".hero-copy")).transform;
    const trackH = document.querySelector(".post-life-track").getBoundingClientRect().height;
    return {
      motion: document.documentElement.getAttribute("data-motion"),
      copyTy: tr && tr !== "none" ? new DOMMatrix(tr).m42 : 0,
      trackH: Math.round(trackH),
    };
  })()`);
  assertCond(rmPaused.motion === "paused" && Math.abs(rmPaused.copyTy) <= 0.5 && rmPaused.trackH < 1400, "prefers-reduced-motion freezes scroll & track", rmPaused);

  // Focus the single footer motion button + activate with Enter key -> overrides reduced motion to "active"!
  await page.evalFn(`window.scrollTo({ top: 0, behavior: "instant" }); document.querySelector(".site-footer [data-motion-toggle]")?.focus();`);
  await cdp.call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }, page.sessionId);
  await cdp.call("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }, page.sessionId);
  await cdp.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, page.sessionId);
  await sleep(250);
  const resumed = await page.evalFn(`(() => {
    const trackH = document.querySelector(".post-life-track").getBoundingClientRect().height;
    return {
      activeElAttr: document.activeElement?.getAttribute("data-motion-toggle"),
      motion: document.documentElement.getAttribute("data-motion"),
      trackH: Math.round(trackH),
    };
  })()`);
  assertCond(resumed.motion === "active" && resumed.trackH >= 2800, "Keyboard footer MotionToggle Resume overrides reduced motion", resumed);
  await page.close();

  // Save dark & light desktop screenshots of / and /sign-up into .logs/
  const shots = [
    { file: "landing-dark.png", route: "/", theme: "dark" },
    { file: "landing-light.png", route: "/", theme: "light" },
    { file: "signup-dark.png", route: "/sign-up", theme: "dark" },
    { file: "signup-light.png", route: "/sign-up", theme: "light" },
  ];
  for (const s of shots) {
    const sp = await openPage(cdp, { width: 1440, height: 900, theme: s.theme });
    await cdp.call("Page.navigate", { url: `http://127.0.0.1:${port}${s.route}` }, sp.sessionId);
    await sp.waitComplete();
    await sleep(900);
    const { data } = await cdp.call("Page.captureScreenshot", { format: "png" }, sp.sessionId);
    fs.writeFileSync(path.join(LOG_DIR, s.file), Buffer.from(data, "base64"));
    await sp.close();
  }
  console.log("  Saved screenshots to .logs/: landing-dark.png, landing-light.png, signup-dark.png, signup-light.png");
}

async function main() {
  const port = await freePort();
  const cdpPort = await freePort();
  const profileDir = path.join(LOG_DIR, `chrome-verify-${cdpPort}`);
  const server = await startServer(port);
  const { proc: chrome, wsUrl } = await startChrome(cdpPort, profileDir);
  const cdp = makeCdp(wsUrl);
  try {
    await runPerfBenchmarks(cdp, port);
    await runRoutesAudit(cdp, port);
    await runLandingPointerPhysics(cdp, port);
    await runScrollChoreography(cdp, port);
    await runSignUpAuthChecks(cdp, port);
    await runReducedMotionAndScreenshots(cdp, port);
    console.log(`\n=== SUMMARY: ${failures.length} FAILURES ===`);
    if (failures.length > 0) {
      console.error(failures);
      process.exitCode = 1;
    }
  } finally {
    try { cdp.ws.close(); } catch {}
    try { execSync(`taskkill /F /T /PID ${chrome.pid}`, { stdio: "ignore" }); } catch {}
    try { execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" }); } catch {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
}

await main();
