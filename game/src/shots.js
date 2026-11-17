// Giltwake — restages the real game for screenshots: ?shot=title|play|won|lost&seed=N.
// Each shot builds a run with the game's own world and boat code, plays it forward with a
// scripted pilot, then hands the frozen state to the normal renderer.

import { LAYOUT, TUNING } from './config.js';
import { createRun, startStretch, updateAttract, updateRun, winRun, loseRun } from './world.js';

/** A stand-in for the input module: steers toward a point in screen space, no keys pressed. */
function scriptedPilot() {
  const pilot = {
    mouse: { x: LAYOUT.boatScreenX + 60, y: 360, inside: true, lastMove: 1 },
    held: {},
    took: () => false,
    endFrame: () => {},
    keyAxis: () => ({ x: 0, y: 0 }),
    mouseSteering: () => true,
    onFirstGesture: () => {},
  };
  return pilot;
}

/** Plays `seconds` of the run with the pilot chasing the nearest leaf ahead; damage is ignored. */
function playForward(run, pilot, seconds) {
  const steps = Math.round(seconds / TUNING.fixedStep);
  for (let i = 0; i < steps; i++) {
    const boat = run.boat;
    const ahead = run.stretch.leaves.find((leaf) => !leaf.taken && leaf.x > boat.x + 20 && leaf.x < boat.x + 400);
    pilot.mouse.x = (ahead ? ahead.x : boat.x + 120) - run.cameraX;
    pilot.mouse.y = ahead ? ahead.y : 360;
    boat.invuln = 1; // the staged pilot is never hurt
    updateRun(run, pilot, TUNING.fixedStep);
  }
  run.boat.invuln = 0;
  run.popups = run.popups.filter((pop) => !pop.text.startsWith('HULL'));
}

/**
 * Builds the state for one screenshot. Returns { screen, run } for main.js to show frozen.
 * name: 'title' | 'play' | 'won' | 'lost'
 */
export function stageShot(name, seed) {
  const pilot = scriptedPilot();
  const run = createRun(seed);
  run.events.length = 0;

  if (name === 'title') {
    for (let i = 0; i < 60 * 9; i++) updateAttract(run, TUNING.fixedStep);
    return { screen: 'title', run, clock: 1.0 };
  }

  if (name === 'play') {
    // Mid-run on the second stretch: one landing behind, leaves chained, a clock-bridge ahead.
    run.docks = 1;
    run.score = 1460;
    run.timeLeft = 76;
    startStretch(run, 1);
    const bridge = run.stretch.bridges[1];
    run.boat.x = bridge.x - 1000;
    run.cameraX = run.boat.x - LAYOUT.boatScreenX;
    playForward(run, pilot, 2.6);
    run.banner = null;
    run.boat.hull = 2;
    run.shake = 0;
    run.events.length = 0;
    return { screen: 'play', run, clock: 2.0 };
  }

  if (name === 'won') {
    run.docks = 3;
    run.score = 4120;
    run.leavesTaken = 61;
    run.bestChain = 14;
    run.timeLeft = 23.4;
    startStretch(run, 2);
    run.banner = null;
    run.boat.hull = 2;
    run.boat.x = run.stretch.dock.x;
    run.boat.y = LAYOUT.waterTop + 22;
    run.cameraX = run.stretch.dock.x - 700; // the dawn dock and flood gate to the right of the card
    winRun(run);
    run.events.length = 0;
    return { screen: 'won', run, clock: 0.4 };
  }

  // lost: the hull gave way on the third stretch
  run.docks = 2;
  run.score = 2290;
  run.leavesTaken = 38;
  run.bestChain = 9;
  run.timeLeft = 41;
  startStretch(run, 2);
  run.banner = null;
  const pool = run.stretch.whirlpools[0];
  run.boat.x = pool.x + 10;
  run.boat.y = pool.y - 6;
  run.cameraX = run.boat.x - 770; // the boat going under, to the right of the card
  run.boat.hull = 0;
  run.boat.sinking = 0.5;
  loseRun(run, 'hull');
  run.events.length = 0;
  return { screen: 'lost', run, clock: 0.4 };
}
