// Giltwake — headless-Chrome regression test: a click and Space must start docking whenever the
// boat is inside a landing's glow, and must not dock outside it.
//   node tests/dock-glow.mjs
// Serves this repo's game/ with serve.ts on a free localhost port, drives the live game in the
// installed Google Chrome, and exits non-zero if any case fails. Boat placement uses the game's
// ?test hook; the dock action itself is always a real mouse click on the canvas or a real Space key.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './chrome.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const proc = spawn(process.execPath, ['serve.ts', '--port', String(port)], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serve.ts did not start')), 10000);
    proc.stdout.on('data', (chunk) => { if (String(chunk).includes(`:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`serve.ts exited (${code})`)); });
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    stop: () => new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); }),
  };
}

async function waitFor(page, expression, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate(expression)) return;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

const STATE = `(() => { const g = window.giltwakeTest.game; const r = g.run;
  return { screen: g.screen, paused: g.paused, phase: r.phase, docks: r.docks, stretch: r.stretch.index, inDockGlow: r.inDockGlow }; })()`;

/** Loads the game, starts a run with a real Enter key, and moves the boat `offsetY` below landing I. */
async function setUp(page, baseUrl, offsetY) {
  await page.goto(`${baseUrl}?test&seed=7`);
  await waitFor(page, `document.body.dataset.ready === 'game' && !!window.giltwakeTest`, 10000, 'the game to load');
  await page.mouseMove(4, 300); // park the pointer off the canvas so it does not steer
  await page.key('Enter', 'Enter', 13);
  await waitFor(page, `window.giltwakeTest.game.screen === 'play'`, 3000, 'the run to start');
  await page.evaluate(`(() => {
    const { game, LAYOUT } = window.giltwakeTest;
    const run = game.run;
    const dock = run.stretch.dock;
    run.banner = null;
    run.boat.x = dock.x;
    run.boat.y = dock.y + ${offsetY};
    run.boat.steerX = -run.stretch.current; // hold still against the current (the floor still drifts it a little)
    run.boat.steerY = 0;
    run.boat.invuln = 999;
    run.cameraX = run.boat.x - LAYOUT.boatScreenX;
  })()`);
  await sleep(80); // a few real frames so the run recomputes inDockGlow
}

/** Where the boat is on the page, in CSS pixels, from the live camera. */
async function boatOnPage(page) {
  return page.evaluate(`(() => {
    const { game, TUNING } = window.giltwakeTest;
    const rect = document.getElementById('game').getBoundingClientRect();
    const run = game.run;
    return { x: rect.left + ((run.boat.x - run.cameraX) / 960) * rect.width, y: rect.top + (run.boat.y / 600) * rect.height };
  })()`);
}

async function act(page, how) {
  if (how === 'click') {
    const at = await boatOnPage(page);
    await page.click(at.x, at.y);
  } else {
    await page.key('Space', ' ', 32);
  }
}

async function caseDocks(page, baseUrl, how) {
  await setUp(page, baseUrl, 40); // well inside the dashed ring
  const before = await page.evaluate(STATE);
  if (!before.inDockGlow) throw new Error(`boat placed inside the glow but inDockGlow=false (${JSON.stringify(before)})`);
  if (before.phase !== 'play' || before.docks !== 0) throw new Error(`unexpected start state ${JSON.stringify(before)}`);
  await act(page, how);
  await waitFor(page, `window.giltwakeTest.game.run.phase === 'docking'`, 1000, `phase 'docking' after ${how}`);
  await waitFor(page, `window.giltwakeTest.game.run.docks === 1 && window.giltwakeTest.game.run.stretch.index === 1`, 4000, 'docks to reach 1');
}

async function caseDoesNotDock(page, baseUrl, how) {
  await setUp(page, baseUrl, 130); // clearly outside the ring and its glow
  const before = await page.evaluate(STATE);
  if (before.inDockGlow) throw new Error(`boat placed outside the glow but inDockGlow=true (${JSON.stringify(before)})`);
  await act(page, how);
  await sleep(400);
  const after = await page.evaluate(STATE);
  if (after.screen !== 'play' || after.paused) throw new Error(`game left play: ${JSON.stringify(after)}`);
  if (after.phase !== 'play' || after.docks !== 0) throw new Error(`docked from outside the glow: ${JSON.stringify(after)}`);
}

/** The drawn ring and the dock check share one rule: hull crossing the ring counts, beyond does not. */
async function caseSharedRule(page, baseUrl) {
  await page.goto(`${baseUrl}?test&seed=7`);
  await waitFor(page, `!!window.giltwakeTest`, 10000, 'the game to load');
  const result = await page.evaluate(`(() => {
    const { game, inDockGlow, TUNING } = window.giltwakeTest;
    const d = game.run.stretch.dock;
    const edge = TUNING.dockRadius + TUNING.boatRadius;
    return { centre: inDockGlow(d, d.x, d.y), ring: inDockGlow(d, d.x, d.y + TUNING.dockRadius),
             edge: inDockGlow(d, d.x + edge, d.y), beyond: inDockGlow(d, d.x + edge + 1, d.y) };
  })()`);
  if (!(result.centre && result.ring && result.edge && !result.beyond)) throw new Error(`rule mismatch ${JSON.stringify(result)}`);
}

const CASES = [
  ['click inside the glow starts docking', (p, u) => caseDocks(p, u, 'click')],
  ['Space inside the glow starts docking', (p, u) => caseDocks(p, u, 'space')],
  ['click outside the glow does not dock', (p, u) => caseDoesNotDock(p, u, 'click')],
  ['Space outside the glow does not dock', (p, u) => caseDoesNotDock(p, u, 'space')],
  ['drawn ring and dock check share one rule', (p, u) => caseSharedRule(p, u)],
];

let failures = 0;
const server = await startServer();
let page;
try {
  page = await launchChrome();
  for (const [name, run] of CASES) {
    try {
      await run(page, server.url);
      console.log(`PASS  ${name}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL  ${name}: ${error.message}`);
    }
  }
} catch (error) {
  failures += 1;
  console.log(`FAIL  setup: ${error.message}`);
} finally {
  if (page) await page.close();
  await server.stop();
}
console.log(failures ? `${failures} case(s) failed` : `all ${CASES.length} cases passed`);
process.exit(failures ? 1 : 0);
