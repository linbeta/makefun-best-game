// Giltwake — entry point: screens (title, play, won, lost), the fixed-step loop, input wiring,
// sound cues from game events, and the ?shot= bootstrap used for screenshots.

import { TUNING, VIEW } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createRun, updateAttract, updateRun } from './world.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
let nextSeed = fixedSeed ?? ((Date.now() ^ 0x5bd1e995) >>> 0);

const input = createInput(canvas, VIEW.width, VIEW.height);
const audio = createAudio();
const renderer = createRenderer(canvas);

const game = {
  screen: 'title',   // title | play | won | lost
  run: createRun(nextSeed),
  paused: false,
  frozen: false,     // a staged screenshot holds still until the player acts
  clock: 0,
};

input.onFirstGesture(() => audio.unlock());

function newSeed() {
  if (fixedSeed !== null) return fixedSeed;
  nextSeed = (Math.imul(nextSeed, 1664525) + 1013904223) >>> 0;
  return nextSeed;
}

function startRun() {
  game.run = createRun(newSeed());
  game.screen = 'play';
  game.paused = false;
  game.frozen = false;
  audio.unlock();
  audio.titleMotif();
}

function showTitle() {
  game.run = createRun(newSeed());
  game.screen = 'title';
  game.paused = false;
  game.frozen = false;
  audio.titleMotif();
}

/** Menu keys that work on every screen, then the screen's own actions. */
function handleActions() {
  if (input.took('mute')) audio.toggleMute();
  if (input.took('restart')) { startRun(); return; }

  const anyAction = input.took('start') || input.took('click') || input.took('dock') || input.took('pause');
  if (game.frozen && anyAction) {
    game.frozen = false;
    if (game.screen === 'play') return;
  }

  switch (game.screen) {
    case 'title':
      if (input.took('start') || input.took('click')) startRun();
      break;
    case 'play':
      if (input.took('pause')) game.paused = !game.paused;
      if (input.took('blur')) game.paused = true;
      break;
    case 'won':
    case 'lost':
      if (input.took('click')) startRun();
      else if (input.took('start')) showTitle();
      break;
  }
}

/** Turns what happened in the world this step into sounds. */
function playEventSounds(run) {
  for (const event of run.events) {
    if (event.type === 'leaf') audio.leafChime(event.chain);
    else if (event.type === 'dock') audio.dockBell();
    else if (event.type === 'hit') audio.hullKnock();
    else if (event.type === 'cogRelease') audio.cogWhirr();
    else if (event.type === 'splash') audio.splash();
    else if (event.type === 'won') audio.winFanfare();
    else if (event.type === 'lost') audio.loseToll();
  }
  run.events.length = 0;
}

function step(dt) {
  handleActions();
  input.endFrame();
  if (game.frozen) return;
  game.clock += dt;
  const run = game.run;

  if (game.screen === 'title') {
    updateAttract(run, dt);
  } else if (game.screen === 'play' && !game.paused) {
    updateRun(run, input, dt);
    if (run.phase === 'won') game.screen = 'won';
    if (run.phase === 'lost') game.screen = 'lost';
  } else if (game.screen === 'won' || game.screen === 'lost') {
    updateRun(run, input, dt); // the water keeps moving behind the result card
  }
  playEventSounds(run);

  const urgency = game.screen === 'play' && run.timeLeft < TUNING.floodWarnSeconds ? 1 - run.timeLeft / TUNING.floodWarnSeconds : 0;
  audio.setAmbience(game.paused ? 0.3 : 1, game.paused ? 0 : urgency);
}

function view() {
  return { screen: game.screen, run: game.run, paused: game.paused, clock: game.clock, muted: audio.muted };
}

// Fixed-step loop: simulation at 60 Hz whatever the display rate, drawing once per frame.
let last = performance.now();
let accumulator = 0;
function frame(now) {
  accumulator += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (accumulator >= TUNING.fixedStep) {
    step(TUNING.fixedStep);
    accumulator -= TUNING.fixedStep;
  }
  renderer.draw(view());
  requestAnimationFrame(frame);
}

// ?shot=title|play|won|lost restages the real game, frozen, for screenshots.
const shot = params.get('shot');
if (shot) {
  const staged = stageShot(shot, fixedSeed ?? 1);
  game.screen = staged.screen;
  game.run = staged.run;
  game.clock = staged.clock;
  game.frozen = true;
}

renderer.draw(view());
document.body.dataset.ready = shot ? `shot-${shot}` : 'game';
requestAnimationFrame(frame);
