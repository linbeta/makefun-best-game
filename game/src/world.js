// Giltwake — the Brass Canal: seeded stretches, landings, hazards, gilt leaves, scoring, and the
// rules that decide a win (dock at all three landings) or a loss (hull breaks or the flood arrives).

import { LAYOUT, ROMAN, STRETCHES, TUNING, VIEW } from './config.js';
import { createRandom, deriveSeed } from './random.js';
import { boostBoat, createBoat, damageHull, desiredSteer, steerBoat } from './boat.js';

const WATER_MID = (LAYOUT.waterTop + LAYOUT.waterBottom) / 2;
const LANE_TOP = LAYOUT.waterTop + 34;
const LANE_BOTTOM = LAYOUT.waterBottom - 34;

// ---------------------------------------------------------------- run lifecycle

export function createRun(seed) {
  const run = {
    seed,
    phase: 'play',          // play | docking | sinking | won | lost
    phaseTimer: 0,
    loseReason: '',
    score: 0,
    chain: 0,
    bestChain: 0,
    chainTimer: 0,
    leavesTaken: 0,
    docks: 0,
    timeLeft: TUNING.floodSeconds,
    time: 0,
    boat: createBoat(),
    stretch: null,
    cameraX: 0,
    shake: 0,
    inDockGlow: false,
    banner: null,
    particles: [],
    popups: [],
    events: [],
  };
  startStretch(run, 0);
  return run;
}

/** Lays out canal stretch `index` from the run's seed and puts the boat at its head. */
export function startStretch(run, index) {
  run.stretch = generateStretch(run.seed, index);
  const keepHull = run.boat.hull;
  run.boat = createBoat();
  run.boat.hull = keepHull;
  run.cameraX = 0;
  run.phase = 'play';
  run.phaseTimer = 0;
  run.particles.length = 0;
  run.popups.length = 0;
  run.banner = { title: `Stretch ${ROMAN[index]}`, sub: run.stretch.name, t: 2.6 };
}

export function generateStretch(seed, index) {
  const spec = STRETCHES[index];
  const rng = createRandom(deriveSeed(seed, 100 + index));
  const length = spec.length;
  const stretch = {
    index,
    name: spec.name,
    length,
    current: spec.current,
    cogEvery: spec.cogEvery,
    bridges: [],
    whirlpools: [],
    barges: [],
    leaves: [],
    cogs: [],
    lamps: [],
    dock: null,
    boomX: length - 50,
    finalGate: index === STRETCHES.length - 1,
  };

  // Clock-bridges, spread evenly with a little jitter.
  const span = length - 1500;
  for (let i = 0; i < spec.bridges; i++) {
    const x = 850 + (span * (i + 0.5)) / spec.bridges + rng.range(-120, 120);
    stretch.bridges.push({ x, width: 46, clockPhase: rng.range(0, Math.PI * 2), cogTimer: rng.range(0.4, 1.2) });
  }

  // Whirlpools, never on top of a bridge or each other.
  let guard = 0;
  while (stretch.whirlpools.length < spec.whirlpools && guard++ < 400) {
    const pool = { x: rng.range(700, length - 520), y: rng.range(LANE_TOP + 20, LANE_BOTTOM - 20), r: rng.range(46, 64), spin: rng.range(0, 6) };
    const clearOfBridges = stretch.bridges.every((b) => Math.abs(b.x - pool.x) > 150);
    const clearOfPools = stretch.whirlpools.every((p) => Math.hypot(p.x - pool.x, p.y - pool.y) > 260);
    if (clearOfBridges && clearOfPools) stretch.whirlpools.push(pool);
  }

  // Barges: some drift with the current (the boat overtakes them), some come upstream at it.
  for (let i = 0; i < spec.barges; i++) {
    const oncoming = i % 2 === 1;
    const len = rng.range(150, 210);
    stretch.barges.push({
      x: oncoming ? rng.range(1400, length - 300) : rng.range(600, length - 1600),
      y: rng.pick([LANE_TOP + 22, WATER_MID, LANE_BOTTOM - 22]) + rng.range(-12, 12),
      len,
      wid: 40,
      vx: oncoming ? -rng.range(45, 75) - index * 10 : spec.current * rng.range(0.35, 0.55),
      oncoming,
      fade: 1,
      lampPhase: rng.range(0, 6),
    });
  }

  // Gilt leaf clusters in lines, waves and diagonals; some tempt the boat near a hazard.
  for (let c = 0; c < spec.leafClusters; c++) {
    const startX = 420 + ((length - 1000) * c) / spec.leafClusters + rng.range(-40, 40);
    const shape = rng.pick(['line', 'wave', 'diag', 'diag']);
    const baseY = rng.range(LANE_TOP, LANE_BOTTOM);
    const count = rng.int(5, 8);
    const dir = rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < count; i++) {
      let y = baseY;
      if (shape === 'wave') y = baseY + Math.sin(i * 0.9) * 46;
      if (shape === 'diag') y = baseY + dir * i * 24;
      y = Math.min(LANE_BOTTOM + 10, Math.max(LANE_TOP - 10, y));
      stretch.leaves.push({ x: startX + i * 38, y, phase: rng.range(0, 6), taken: false });
    }
  }

  // The landing for this stretch, alternating banks, just before the chain boom.
  const side = index % 2 === 0 ? 'far' : 'near';
  stretch.dock = {
    x: length - 230,
    y: side === 'far' ? LAYOUT.waterTop + 46 : LAYOUT.waterBottom - 46,
    side,
    label: `Landing ${ROMAN[index]}`,
  };
  for (let x = 160; x < length; x += 300) stretch.lamps.push({ x: x + rng.range(-30, 30), flicker: rng.range(0, 6) });
  return stretch;
}

// ---------------------------------------------------------------- per-step update

/** Advances the whole run one fixed step for the player. */
export function updateRun(run, input, dt) {
  run.time += dt;
  run.shake = Math.max(0, run.shake - dt * 2.5);
  if (run.banner) {
    run.banner.t -= dt;
    if (run.banner.t <= 0) run.banner = null;
  }
  updateParticles(run, dt);

  if (run.phase === 'play') updatePlay(run, input, dt);
  else if (run.phase === 'docking') updateDocking(run, dt);
  else if (run.phase === 'sinking') updateSinking(run, dt);
  else updateDrift(run, dt);
}

function updatePlay(run, input, dt) {
  const stretch = run.stretch;
  const boat = run.boat;

  run.timeLeft -= dt;
  if (run.timeLeft <= 0) {
    run.timeLeft = 0;
    loseRun(run, 'flood');
    return;
  }

  const wish = desiredSteer(boat, input, run.cameraX);
  steerBoat(boat, wish, stretch.current, dt);
  if (boat.x > stretch.boomX - 26) {
    boat.x = stretch.boomX - 26;
    boat.steerX = Math.min(boat.steerX, 0);
  }

  updateHazards(run, dt);
  collectLeaves(run);
  checkCollisions(run);
  updateChain(run, dt);
  followCamera(run, dt);

  run.inDockGlow = inDockGlow(stretch.dock, boat.x, boat.y);
  if (run.inDockGlow && (input.took('dock') || input.took('click'))) beginDocking(run);

  if (boat.hull <= 0) {
    run.phase = 'sinking';
    run.phaseTimer = 0;
    run.events.push({ type: 'sink' });
  }
}

/** Title-screen attract mode: the boat drifts down the canal on its own, nothing can hurt it. */
export function updateAttract(run, dt) {
  run.time += dt;
  const boat = run.boat;
  const wish = { x: 20, y: (WATER_MID + Math.sin(run.time * 0.45) * 90 - boat.y) * 1.5 };
  steerBoat(boat, wish, run.stretch.current * 0.7, dt);
  updateHazards(run, dt, true);
  updateParticles(run, dt);
  followCamera(run, dt);
  if (boat.x > run.stretch.length - 900) {
    boat.x = 200;
    boat.wake.length = 0;
    run.cameraX = 0;
  }
}

function updateDrift(run, dt) {
  updateHazards(run, dt, true);
  run.boat.bob += dt;
  // after a loss, ease the camera so the wreck sits to the right of the result card
  if (run.phase === 'lost') run.cameraX += (Math.max(0, run.boat.x - 770) - run.cameraX) * Math.min(1, dt * 2);
}

function followCamera(run, dt) {
  const target = run.boat.x - LAYOUT.boatScreenX;
  const maxCam = run.stretch.length - VIEW.width + 70;
  run.cameraX += (Math.max(0, Math.min(maxCam, target)) - run.cameraX) * Math.min(1, dt * 10);
}

function updateHazards(run, dt, harmless = false) {
  const stretch = run.stretch;
  const boat = run.boat;
  for (const pool of stretch.whirlpools) pool.spin += dt * 2.4;
  for (const leaf of stretch.leaves) leaf.phase += dt * 2;
  for (const bridge of stretch.bridges) bridge.clockPhase += dt * 0.6;

  for (const barge of stretch.barges) {
    barge.x += barge.vx * dt;
    barge.lampPhase += dt * 3;
    if (!barge.oncoming && barge.x + barge.len > stretch.length - 520) barge.fade = Math.max(0, barge.fade - dt * 1.5);
    if (barge.oncoming && barge.x + barge.len < -50) barge.fade = 0;
  }

  if (harmless) return;

  // Clock-bridges near the boat shake loose cogs aimed at its lane.
  for (const bridge of stretch.bridges) {
    const ahead = bridge.x - boat.x;
    if (ahead < -160 || ahead > 640) continue;
    bridge.cogTimer -= dt;
    if (bridge.cogTimer <= 0) {
      bridge.cogTimer = stretch.cogEvery * (0.75 + 0.5 * pseudo(run.time + bridge.x));
      const spreadY = (pseudo(run.time * 1.7 + bridge.x) - 0.5) * 120;
      stretch.cogs.push({
        x: bridge.x + (pseudo(run.time * 3.1 + bridge.x) - 0.5) * 200,
        y: Math.min(LANE_BOTTOM, Math.max(LANE_TOP, boat.y + spreadY)),
        t: 0,
        fall: 1.15,
        r: 22,
        landed: false,
        sink: 0,
        spin: 0,
      });
      run.events.push({ type: 'cogRelease' });
    }
  }

  for (const cog of stretch.cogs) {
    cog.spin += dt * 5;
    if (!cog.landed) {
      cog.t += dt;
      if (cog.t >= cog.fall) {
        cog.landed = true;
        splash(run, cog.x, cog.y, 16, '#9fd8d8');
        run.events.push({ type: 'splash' });
        if (Math.hypot(boat.x - cog.x, boat.y - cog.y) < cog.r + TUNING.boatRadius - 2) {
          hitBoat(run, boat.y < cog.y ? -160 : 160, 'cog');
        }
      }
    } else {
      cog.sink += dt * 1.3;
    }
  }
  stretch.cogs = stretch.cogs.filter((cog) => cog.sink < 1);
}

/** A deterministic hash in [0,1) so cog drops replay the same for the same run. */
function pseudo(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function checkCollisions(run) {
  const boat = run.boat;
  const r = TUNING.boatRadius;

  for (const pool of run.stretch.whirlpools) {
    const dx = pool.x - boat.x;
    const dy = pool.y - boat.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < pool.r * 2) {
      // The pull grows toward the eye; the eye itself cracks the hull.
      const pull = (1 - dist / (pool.r * 2)) * 150;
      boat.y += (dy / dist) * pull * TUNING.fixedStep;
      boat.x += (dx / dist) * pull * 0.5 * TUNING.fixedStep;
      boat.steerY += (-dx / dist) * pull * 0.06; // a little swirl
    }
    if (dist < pool.r * 0.55 + r) hitBoat(run, dy > 0 ? -220 : 220, 'whirlpool');
  }

  for (const barge of run.stretch.barges) {
    if (barge.fade < 0.5) continue;
    const nearestX = Math.max(barge.x, Math.min(boat.x, barge.x + barge.len));
    const nearestY = Math.max(barge.y - barge.wid / 2, Math.min(boat.y, barge.y + barge.wid / 2));
    if (Math.hypot(boat.x - nearestX, boat.y - nearestY) < r) {
      hitBoat(run, boat.y < barge.y ? -230 : 230, 'barge');
      boat.y += boat.y < barge.y ? -6 : 6;
    }
  }
}

function hitBoat(run, pushY, cause) {
  if (!damageHull(run.boat, pushY)) return;
  run.shake = 1;
  run.chain = 0;
  run.chainTimer = 0;
  splash(run, run.boat.x, run.boat.y, 22, '#ffd27a');
  run.popups.push({ x: run.boat.x, y: run.boat.y - 26, text: 'HULL CRACKED', life: 1.2, color: '#ff8a6a' });
  run.events.push({ type: 'hit', cause });
}

function collectLeaves(run) {
  const boat = run.boat;
  for (const leaf of run.stretch.leaves) {
    if (leaf.taken) continue;
    const ly = leaf.y + Math.sin(leaf.phase) * 4;
    if (Math.hypot(boat.x - leaf.x, boat.y - ly) < TUNING.leafRadius + TUNING.boatRadius) {
      leaf.taken = true;
      run.chain = run.chainTimer > 0 ? run.chain + 1 : 1;
      run.chainTimer = TUNING.chainWindow;
      run.bestChain = Math.max(run.bestChain, run.chain);
      run.leavesTaken += 1;
      const points = TUNING.leafPoints * Math.min(run.chain, TUNING.chainCap);
      run.score += points;
      boostBoat(boat);
      splash(run, leaf.x, ly, 8, '#ffe7a3');
      run.popups.push({ x: leaf.x, y: ly - 18, text: `+${points}`, life: 0.9, color: '#ffe7a3' });
      run.events.push({ type: 'leaf', chain: run.chain });
    }
  }
}

function updateChain(run, dt) {
  if (run.chainTimer > 0) {
    run.chainTimer -= dt;
    if (run.chainTimer <= 0) { run.chainTimer = 0; run.chain = 0; }
  }
}

// ---------------------------------------------------------------- landings, win and loss

/**
 * The one rule for "inside a landing's glow", shared by the dock check and the renderer: the glow is
 * the disc inside the dashed ring (radius TUNING.dockRadius, world coordinates), and the boat is in it
 * as soon as any part of its hull (TUNING.boatRadius) crosses that ring.
 */
export function inDockGlow(dock, x, y) {
  return Math.hypot(x - dock.x, y - dock.y) <= TUNING.dockRadius + TUNING.boatRadius;
}

function beginDocking(run) {
  run.phase = 'docking';
  run.phaseTimer = 0;
  run.inDockGlow = false;
  const bonus = TUNING.dockBonus * (run.stretch.index + 1);
  run.score += bonus;
  run.popups.push({ x: run.stretch.dock.x, y: run.stretch.dock.y - 40, text: `DOCKED +${bonus}`, life: 1.6, color: '#ffe7a3' });
  splash(run, run.boat.x, run.boat.y, 30, '#ffe7a3');
  run.events.push({ type: 'dock', index: run.stretch.index });
}

function updateDocking(run, dt) {
  run.phaseTimer += dt;
  const boat = run.boat;
  const dock = run.stretch.dock;
  const pierY = dock.side === 'far' ? LAYOUT.waterTop + 22 : LAYOUT.waterBottom - 22;
  boat.x += (dock.x - boat.x) * Math.min(1, dt * 3);
  boat.y += (pierY - boat.y) * Math.min(1, dt * 3);
  boat.heading += (0 - boat.heading) * Math.min(1, dt * 4);
  boat.bob += dt;
  updateHazards(run, dt, true);
  followCamera(run, dt);
  if (run.phaseTimer >= TUNING.dockingSeconds) {
    run.docks += 1;
    if (run.docks >= STRETCHES.length) winRun(run);
    else startStretch(run, run.stretch.index + 1);
  }
}

function updateSinking(run, dt) {
  run.phaseTimer += dt;
  run.boat.sinking = Math.min(1, run.phaseTimer / TUNING.sinkingSeconds);
  run.boat.bob += dt;
  updateHazards(run, dt, true);
  if (run.phaseTimer >= TUNING.sinkingSeconds) loseRun(run, 'hull');
}

export function winRun(run) {
  const timeBonus = Math.floor(run.timeLeft) * TUNING.timeBonusPerSecond;
  const hullBonus = run.boat.hull * TUNING.hullBonus;
  run.score += timeBonus + hullBonus;
  run.result = { timeBonus, hullBonus };
  run.phase = 'won';
  run.events.push({ type: 'won' });
}

export function loseRun(run, reason) {
  run.phase = 'lost';
  run.loseReason = reason;
  run.events.push({ type: 'lost', reason });
}

// ---------------------------------------------------------------- effects

function splash(run, x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + pseudo(run.time + i) * 0.6;
    const speed = 40 + pseudo(run.time * 2 + i) * 110;
    run.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.7, max: 0.7, color, size: 2 + pseudo(i + x) * 2.5 });
  }
}

function updateParticles(run, dt) {
  for (const p of run.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 3;
    p.vy *= 1 - dt * 3;
    p.life -= dt;
  }
  run.particles = run.particles.filter((p) => p.life > 0);
  for (const pop of run.popups) { pop.y -= dt * 30; pop.life -= dt; }
  run.popups = run.popups.filter((pop) => pop.life > 0);
}

/** How far through the current stretch the boat is, 0..1, for the HUD's progress line. */
export function stretchProgress(run) {
  return Math.max(0, Math.min(1, run.boat.x / run.stretch.dock.x));
}
