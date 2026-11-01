// Browser end-to-end tests: phone UI, Android Auto head-unit mock, car surface mode.
// Needs Playwright with Chromium:  npm i -D playwright && npx playwright install chromium
// Run:  node --test simulator/test/e2e.test.mjs   (serves simulator/ on a free port itself)
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { /* skipped below */ }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json" };

function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      const idx = path.join(p, "index.html");
      if (fs.existsSync(idx)) { res.writeHead(200, { "Content-Type": "text/html" }); return fs.createReadStream(idx).pipe(res); }
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => server.listen(0, () => r(server)));
}

const skip = !chromium && "playwright not installed";
let server, browser, base;
test.before(async () => { if (skip) return; server = await serve(); base = `http://localhost:${server.address().port}`; browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); server?.close(); });

async function open(url, viewport = { width: 1500, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + url);
  await page.waitForFunction(() => globalThis.cybernav?.ctl?.session?.position);
  return { page, errors };
}
const state = page => page.evaluate(() => cybernav.ctl.session.state);

test("phone: search, preview, start, demo drive to arrival", { skip }, async () => {
  const { page, errors } = await open("/?offline&noboot");
  const phone = page.locator("[data-testid=phone]");
  await phone.locator("input[type=search]").fill("Linnégatan");
  await phone.locator(".result").first().click();
  await page.locator("[data-testid=route-0]").waitFor();
  assert.ok(await page.locator(".route-opt").count() >= 1);
  await page.locator("[data-testid=start]").click();
  await page.locator("[data-testid=turn-text]").waitFor();
  assert.match(await page.locator("[data-testid=turn-text]").innerText(), /\/\//);
  await phone.locator('[data-act="speed"][data-arg="10"]').click();
  await page.waitForFunction(() => cybernav.ctl.session.state === "ARRIVED", null, { timeout: 90000 });
  await page.locator("[data-testid=done]").click();
  assert.equal(await state(page), "IDLE");
  assert.deepEqual(errors, []);
  await page.close();
});

test("phone: wrong turn during the demo drive reroutes and is logged", { skip }, async () => {
  const { page, errors } = await open("/?offline&noboot");
  await page.evaluate(() => { const c = cybernav.ctl; c.route(c.places.search("Linnégatan")[0]); c.simSpeed = 10; c.start(); });
  await page.waitForTimeout(2500);
  await page.locator('[data-act="wrong"]').click();
  await page.waitForFunction(() => cybernav.ctl.session.rerouteCount > 0, null, { timeout: 60000 });
  assert.ok(await page.locator("#log").innerText().then(t => /REROUTED/.test(t)));
  assert.deepEqual(errors, []);
  await page.close();
});

test("car: head-unit mock drives the full Android Auto flow", { skip }, async () => {
  const { page, errors } = await open("/?offline&noboot");
  const car = page.locator("[data-testid=car-host]");
  await car.locator('[data-id="search"]').click();
  await car.locator("[data-search]").fill("Linnég");
  await car.locator('[data-id="result:0"]').click();
  await car.locator('[data-id="start"]').click();
  await car.locator("[data-testid=host-routing]").waitFor();
  assert.equal(await state(page), "NAVIGATING");
  const model = await page.evaluate(() => cybernav.ctl.carModel());
  assert.equal(model.type, "navigation"); assert.ok(model.routingInfo.maneuver.type);
  await car.locator('[data-id="end"]').click();
  assert.equal(await state(page), "IDLE");
  await car.locator('[data-id="demo"]').click();
  assert.equal(await state(page), "NAVIGATING");
  assert.deepEqual(errors, []);
  await page.close();
});

test("car surface mode exposes the Android bridge API", { skip }, async () => {
  const { page, errors } = await open("/?mode=car&offline");
  const model = JSON.parse(await page.evaluate(() => cybernav.model()));
  assert.equal(model.type, "navigation");
  await page.evaluate(() => { cybernav.action("demo"); cybernav.zoom(1.5); cybernav.pan(40, 10); cybernav.stableArea(300, 0, 80, 60); cybernav.mapAction("recenter"); });
  assert.equal(await state(page), "NAVIGATING");
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => cybernav.surface.view.r.stats);
  assert.ok(stats.ways > 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("phone: tap the map to drop a pin and route there", { skip }, async () => {
  const { page } = await open("/?mode=phone&offline&noboot", { width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.mouse.click(250, 520);
  const sheet = page.locator('[data-act="pinroute"]');
  if (await sheet.count()) { await sheet.click(); assert.equal(await state(page), "PREVIEW"); }
  else assert.fail("tap did not drop a pin near a road");
  await page.close();
});

test("layout: phone width has no horizontal scroll, tabs switch to the car", { skip }, async () => {
  const { page } = await open("/?offline&noboot", { width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `overflow ${overflow}`);
  await page.locator('.sim__tabs [data-tab="car"]').click();
  assert.ok(await page.locator("[data-testid=car-host]").isVisible());
  await page.close();
});

test("themes: switching phosphor recolours the HUD", { skip }, async () => {
  const { page } = await open("/?mode=phone&offline&noboot", { width: 390, height: 844 });
  await page.locator('[data-act="settings"]').click();
  await page.locator('[data-act="theme"][data-arg="amber"]').click();
  const c = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--phosphor").trim());
  assert.equal(c.toLowerCase(), "#ffb000");
  await page.evaluate(() => localStorage.clear());
  await page.close();
});

// ---------- live mode (GPS + OpenStreetMap downloads, with the map servers mocked) ----------
async function overpassFixture() {
  const { RoadNetwork } = await import("../core/network.js");
  const net = new RoadNetwork((await import("../data/network.js")).default);
  const HW = ["motorway", "primary", "tertiary", "residential"];
  return net.ways.map(w => ({ type: "way", id: w.id + 1,
    geometry: w.nodes.map(i => ({ lat: net.lat[i], lon: net.lon[i] })),
    tags: { highway: HW[w.cls], ...(w.name ? { name: w.name } : {}), ...(w.oneway ? { oneway: w.oneway > 0 ? "yes" : "-1" } : {}),
      ...(w.signedLimit ? { maxspeed: String(w.kmh) } : {}), ...(w.roundabout ? { junction: "roundabout" } : {}) } }));
}
const GBG = { latitude: 57.7089, longitude: 11.9737 };
async function liveContext() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: GBG, permissions: ["geolocation"] });
  const els = await overpassFixture();
  const calls = { roads: 0, fail: false };
  await ctx.route(/overpass|maps\.mail\.ru/, async route => {
    const q = decodeURIComponent(route.request().postData() ?? "");
    if (/building/.test(q)) return route.fulfill({ json: { elements: [] } });
    calls.roads++;
    if (calls.fail) return route.fulfill({ status: 429, body: "busy" });
    // Stage 1 asks for ~1.5 km: send the ways near the fix; the wide request gets all.
    const wide = /around:9000/.test(q);
    const near = els.filter(e => wide || e.geometry.some(g => Math.abs(g.lat - GBG.latitude) < 0.012 && Math.abs(g.lon - GBG.longitude) < 0.022));
    return route.fulfill({ json: { elements: near } });
  });
  await ctx.route(/nominatim/, route => route.fulfill({ json: [] }));
  return { ctx, calls };
}

test("live: GPS fix downloads nearby roads, then the wide area, then routes", { skip }, async () => {
  const { ctx, calls } = await liveContext();
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/?mode=phone&live=1&noboot=1");
  await page.waitForFunction(() => cybernav.ctl.liveLoaded && /COMPLETE/.test(cybernav.ctl.log[0]?.text ?? "") || cybernav.ctl.log.some(l => /COMPLETE/.test(l.text)), null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => cybernav.ctl.source), "live");
  assert.ok(await page.locator("[data-testid=chart]").isHidden(), "no-chart panel gone once roads load");
  assert.ok(calls.roads >= 2, "staged download: nearby then wide");
  assert.ok(await page.evaluate(() => cybernav.ctl.net.ways.length) > 3000);
  assert.ok(await page.evaluate(() => !!localStorage.getItem("cybernav.area")), "area cached on the device");
  await page.waitForFunction(() => cybernav.ctl.session.position);
  await page.locator("input[type=search]").fill("Linnégatan");
  await page.locator(".result").first().click();
  await page.locator("[data-testid=start]").click();
  assert.equal(await page.evaluate(() => cybernav.ctl.session.state), "NAVIGATING");
  // The car screen is a second copy of the app: it uses the saved area, no download.
  const before = calls.roads;
  const car = await ctx.newPage();
  await car.goto(base + "/?mode=car&live=1&noboot=1");
  await car.waitForFunction(() => cybernav.ctl.liveLoaded, null, { timeout: 10000 });
  assert.equal(calls.roads, before);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("live: failed download says so, offers retry and demo, and recovers", { skip }, async () => {
  const { ctx, calls } = await liveContext();
  calls.fail = true;
  const page = await ctx.newPage();
  await page.goto(base + "/?mode=phone&live=1&noboot=1");
  const chart = page.locator("[data-testid=chart]");
  await page.waitForFunction(() => cybernav.ctl.chart?.status === "failed", null, { timeout: 30000 });
  assert.match(await chart.innerText(), /MAP DOWNLOAD FAILED/);
  assert.match(await chart.innerText(), /BUSY/);
  calls.fail = false;
  await chart.locator('[data-act="retry"]').click();
  await page.waitForFunction(() => cybernav.ctl.liveLoaded, null, { timeout: 30000 });
  await chart.waitFor({ state: "hidden" });
  // Demo city button from the panel also works.
  calls.fail = true;
  await page.evaluate(() => { localStorage.clear(); cybernav.ctl.goDemo(); cybernav.ctl.goLive(); });
  await page.waitForFunction(() => cybernav.ctl.chart?.status === "failed", null, { timeout: 30000 });
  await chart.locator('[data-act="demo"]').click();
  assert.equal(await page.evaluate(() => cybernav.ctl.source), "demo");
  assert.ok(await chart.isHidden());
  await ctx.close();
});
