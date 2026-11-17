// Giltwake — the gilded paper boat: steering with inertia, the hull, and its glowing wake.

import { LAYOUT, TUNING } from './config.js';

export function createBoat() {
  return {
    x: 120,
    y: (LAYOUT.waterTop + LAYOUT.waterBottom) / 2,
    vx: 0,
    vy: 0,
    steerX: 0,          // velocity on top of the current, smoothed for inertia
    steerY: 0,
    heading: 0,
    hull: TUNING.hullMax,
    invuln: 0,
    boost: 0,
    bob: 0,
    sinking: 0,         // 0..1 while going under
    wake: [],           // trail points { x, y, age, spread }
    wakeTimer: 0,
  };
}

/** Where the player wants to go, as a steering velocity relative to the current. */
export function desiredSteer(boat, input, cameraX) {
  let dx = 0;
  let dy = 0;
  if (input.mouseSteering()) {
    // The boat heads toward the cursor: the farther away it is, the harder it pulls.
    const targetX = cameraX + input.mouse.x;
    const targetY = Math.min(LAYOUT.waterBottom - 14, Math.max(LAYOUT.waterTop + 14, input.mouse.y));
    dx = (targetX - boat.x) * 1.6;
    dy = (targetY - boat.y) * 2.4;
  }
  const keys = input.keyAxis();
  dx += keys.x * TUNING.steerMaxAlong;
  dy += keys.y * TUNING.steerMaxAcross;
  return {
    x: Math.max(-TUNING.steerMaxAlong, Math.min(TUNING.steerMaxAlong, dx)),
    y: Math.max(-TUNING.steerMaxAcross, Math.min(TUNING.steerMaxAcross, dy)),
  };
}

/** Moves the boat one fixed step: the current carries it, steering eases toward the wish. */
export function steerBoat(boat, wish, current, dt) {
  const ease = Math.min(1, dt * TUNING.steerInertia);
  boat.steerX += (wish.x - boat.steerX) * ease;
  boat.steerY += (wish.y - boat.steerY) * ease;

  const boostFactor = boat.boost > 0 ? TUNING.boostFactor : 1;
  const forward = current * boostFactor + boat.steerX;
  boat.vx = Math.max(current * TUNING.minForwardFactor, forward);
  boat.vy = boat.steerY;
  boat.x += boat.vx * dt;
  boat.y += boat.vy * dt;

  const top = LAYOUT.waterTop + 16;
  const bottom = LAYOUT.waterBottom - 16;
  if (boat.y < top) { boat.y = top; boat.steerY = Math.max(0, boat.steerY); }
  if (boat.y > bottom) { boat.y = bottom; boat.steerY = Math.min(0, boat.steerY); }

  const targetHeading = Math.atan2(boat.vy, boat.vx);
  boat.heading += (targetHeading - boat.heading) * Math.min(1, dt * 8);
  boat.bob += dt;
  boat.boost = Math.max(0, boat.boost - dt);
  boat.invuln = Math.max(0, boat.invuln - dt);
  updateWake(boat, dt);
}

/** Leaves glowing gold trail points behind the stern; they spread and fade. */
export function updateWake(boat, dt) {
  boat.wakeTimer -= dt;
  if (boat.wakeTimer <= 0) {
    boat.wakeTimer = 0.035;
    const sternX = boat.x - Math.cos(boat.heading) * 16;
    const sternY = boat.y - Math.sin(boat.heading) * 16;
    boat.wake.push({ x: sternX, y: sternY, age: 0, spread: 0, boosted: boat.boost > 0 });
  }
  for (const point of boat.wake) {
    point.age += dt;
    point.spread += dt * 26;
  }
  while (boat.wake.length && boat.wake[0].age > 1.3) boat.wake.shift();
}

/** Takes one hit on the hull unless still shaken from the last; returns true if it counted. */
export function damageHull(boat, pushY) {
  if (boat.invuln > 0 || boat.hull <= 0) return false;
  boat.hull -= 1;
  boat.invuln = TUNING.invulnSeconds;
  boat.steerY = pushY;
  boat.steerX = -60;
  return true;
}

export function boostBoat(boat) {
  boat.boost = TUNING.boostSeconds;
}
