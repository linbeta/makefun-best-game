// Giltwake — all drawing: the moonlit canal scene, the boat and its wake, hazards, landings,
// the HUD, and the title, pause, win and lose screens. Everything is painted in code.

import { FONTS, LAYOUT, PALETTE, ROMAN, STRETCHES, TUNING, VIEW } from './config.js';
import { createRandom } from './random.js';
import { stretchProgress } from './world.js';

const W = VIEW.width;
const H = VIEW.height;
const SKYLINE_TILE = 1800;
const COBBLE_TILE = 256;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const art = {
    skyline: paintSkylineTile(),
    cobbles: paintCobbleTile(),
    stars: paintStarField(),
  };
  return {
    ctx,
    /** Draws one whole frame for the given game view. */
    draw(view) {
      ctx.save();
      const run = view.run;
      if (run && run.shake > 0 && view.screen === 'play') {
        const s = run.shake * 7;
        ctx.translate(Math.sin(run.time * 91) * s, Math.cos(run.time * 77) * s);
      }
      drawCanalScene(ctx, art, run, view);
      ctx.restore();
      if (view.screen === 'title') drawTitleScreen(ctx, view);
      else if (view.screen === 'play') {
        drawHud(ctx, run, view);
        if (run.banner) drawBanner(ctx, run.banner);
        if (run.inDockGlow && run.phase === 'play') drawDockPrompt(ctx, run);
        if (run.phase === 'docking') drawDockingCard(ctx, run);
        if (view.paused) drawPauseOverlay(ctx);
      } else if (view.screen === 'won') drawWinScreen(ctx, run, view);
      else if (view.screen === 'lost') drawLoseScreen(ctx, run, view);
    },
  };
}

// ---------------------------------------------------------------- pre-painted art

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** A wrap-around strip of rooftops, chimneys and clock towers with warm windows. */
function paintSkylineTile() {
  const c = offscreen(SKYLINE_TILE, LAYOUT.skyBottom);
  const g = c.getContext('2d');
  const rng = createRandom(7331);
  // far row
  for (let x = 0; x < SKYLINE_TILE;) {
    const w = rng.range(50, 110);
    const h = rng.range(40, 80);
    g.fillStyle = PALETTE.buildingFar;
    g.fillRect(x, LAYOUT.skyBottom - h, w + 1, h);
    x += w;
  }
  // near row with roofs and windows
  for (let x = 0; x < SKYLINE_TILE - 60;) {
    const w = rng.range(60, 130);
    const h = rng.range(52, 104);
    const top = LAYOUT.skyBottom - h;
    g.fillStyle = PALETTE.buildingNear;
    g.fillRect(x, top, w, h);
    const roof = rng.pick(['gable', 'flat', 'gable', 'tower']);
    g.beginPath();
    if (roof === 'gable') {
      g.moveTo(x - 4, top); g.lineTo(x + w / 2, top - rng.range(14, 26)); g.lineTo(x + w + 4, top);
    } else if (roof === 'tower') {
      const tw = 22;
      const tx = x + w / 2 - tw / 2;
      g.rect(tx, top - 30, tw, 30);
      g.moveTo(tx - 3, top - 30); g.lineTo(tx + tw / 2, top - 48); g.lineTo(tx + tw + 3, top - 30);
    } else {
      g.rect(x - 2, top - 4, w + 4, 4);
    }
    g.fill();
    g.fillStyle = PALETTE.roofEdge;
    g.fillRect(x, top, w, 2);
    if (rng.chance(0.6)) g.fillRect(x + rng.range(6, w - 14), top - rng.range(10, 18), 7, 18); // chimney
    // windows
    for (let wy = top + 12; wy < LAYOUT.skyBottom - 12; wy += 18) {
      for (let wx = x + 8; wx < x + w - 12; wx += 16) {
        if (!rng.chance(0.38)) continue;
        g.fillStyle = PALETTE.windowGlow;
        g.fillRect(wx - 3, wy - 3, 13, 15);
        g.fillStyle = rng.chance(0.3) ? PALETTE.windowHot : PALETTE.window;
        g.fillRect(wx, wy, 7, 9);
      }
    }
    x += w + rng.range(4, 18);
  }
  return c;
}

/** Wet cobbles: rounded stones with a cold sheen, tiled along both quays. */
function paintCobbleTile() {
  const c = offscreen(COBBLE_TILE, 80);
  const g = c.getContext('2d');
  const rng = createRandom(4242);
  g.fillStyle = PALETTE.cobbleBase;
  g.fillRect(0, 0, COBBLE_TILE, 80);
  for (let row = 0; row < 7; row++) {
    const y = row * 12;
    const shift = row % 2 ? 9 : 0;
    for (let x = -18 + shift; x < COBBLE_TILE + 18; x += 18) {
      const w = 15 + rng.range(-1.5, 1.5);
      g.fillStyle = rng.chance(0.25) ? PALETTE.cobbleLight : PALETTE.cobbleStone;
      roundRect(g, x + 1.5, y + 1.5, w, 9.5, 4);
      g.fill();
      g.fillStyle = PALETTE.cobbleWet;
      roundRect(g, x + 3, y + 2.5, w * 0.55, 3, 2);
      g.fill();
    }
  }
  // make the tile wrap seamlessly by copying its left edge over its right
  g.drawImage(c, 0, 0, 18, 80, COBBLE_TILE, 0, 18, 80);
  return c;
}

function paintStarField() {
  const rng = createRandom(99);
  const stars = [];
  for (let i = 0; i < 70; i++) stars.push({ x: rng.range(0, W), y: rng.range(0, 110), r: rng.range(0.4, 1.4), tw: rng.range(0, 6) });
  return stars;
}

// ---------------------------------------------------------------- the scene

function drawCanalScene(ctx, art, run, view) {
  const t = view.clock;
  const camX = run.cameraX;
  const dawn = view.screen === 'won' ? 1 : 0;
  drawSky(ctx, art, t, camX, dawn);
  drawWater(ctx, run, t, camX, dawn);
  drawQuays(ctx, art, run, t, camX);
  drawLanding(ctx, run, t, camX);
  drawWhirlpools(ctx, run, camX);
  drawLeaves(ctx, run, t, camX);
  drawCogShadows(ctx, run, camX);
  drawBarges(ctx, run, camX);
  drawWake(ctx, run.boat, camX);
  drawBoat(ctx, run.boat, camX, t);
  drawBridges(ctx, run, t, camX);
  drawBoomOrGate(ctx, run, camX);
  drawFallingCogs(ctx, run, camX);
  drawParticles(ctx, run, camX);
  drawPopups(ctx, run, camX);
  drawFloodTint(ctx, run, t, view);
}

function drawSky(ctx, art, t, camX, dawn) {
  const grad = ctx.createLinearGradient(0, 0, 0, LAYOUT.skyBottom);
  grad.addColorStop(0, dawn ? PALETTE.dawnTop : PALETTE.skyTop);
  grad.addColorStop(1, dawn ? PALETTE.dawnBottom : PALETTE.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, LAYOUT.skyBottom + 2);
  if (!dawn) {
    for (const s of art.stars) {
      ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.3 + s.tw);
      ctx.fillStyle = PALETTE.stars;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }
  // moon (a low pale sun-moon at dawn)
  const mx = 872;
  const my = dawn ? 120 : 64;
  const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 110);
  glow.addColorStop(0, dawn ? 'rgba(255,220,160,0.5)' : 'rgba(244,226,170,0.32)');
  glow.addColorStop(1, 'rgba(244,226,170,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(mx - 120, my - 120, 240, 240);
  ctx.fillStyle = dawn ? '#ffe2b0' : PALETTE.moon;
  ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill();
  if (!dawn) {
    ctx.fillStyle = 'rgba(180,170,140,0.35)';
    ctx.beginPath(); ctx.arc(mx - 9, my - 6, 6, 0, Math.PI * 2); ctx.arc(mx + 8, my + 9, 4, 0, Math.PI * 2); ctx.fill();
  }
  // skyline with parallax
  const off = (camX * 0.3) % SKYLINE_TILE;
  ctx.drawImage(art.skyline, -off, 0);
  ctx.drawImage(art.skyline, -off + SKYLINE_TILE, 0);
  if (dawn) {
    ctx.fillStyle = 'rgba(255,170,110,0.12)';
    ctx.fillRect(0, 0, W, LAYOUT.skyBottom);
  }
}

function drawWater(ctx, run, t, camX, dawn) {
  const top = LAYOUT.waterTop;
  const bottom = LAYOUT.waterBottom;
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, dawn ? '#2b4a55' : PALETTE.waterMid);
  grad.addColorStop(0.5, dawn ? '#1a3a44' : PALETTE.waterDeep);
  grad.addColorStop(1, dawn ? '#14303a' : '#020c10');
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, bottom - top);

  // moon road: shimmering gold dashes under the moon
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let y = top + 4; y < bottom; y += 7) {
    const k = (y - top) / (bottom - top);
    const width = 16 + k * 70 + Math.sin(t * 2 + y * 0.31) * 10;
    const x = 872 + Math.sin(t * 1.4 + y * 0.12) * 8 * (1 + k);
    ctx.fillStyle = `rgba(255, 214, 130, ${0.28 * (1 - k * 0.6)})`;
    ctx.fillRect(x - width / 2, y, width, 2);
  }
  // lamp reflections from the far quay
  for (const lamp of run.stretch.lamps) {
    const sx = lamp.x - camX;
    if (sx < -40 || sx > W + 40) continue;
    for (let y = top + 3; y < top + 150; y += 6) {
      const k = (y - top) / 150;
      const w = 10 + Math.sin(t * 3 + y * 0.4 + lamp.flicker) * 4;
      ctx.fillStyle = `rgba(255, 180, 90, ${0.32 * (1 - k)})`;
      ctx.fillRect(sx - w / 2 + Math.sin(t * 2 + y) * 2, y, w, 2);
    }
  }
  ctx.restore();

  // ripples drift with the current, fixed in the world so motion reads
  ctx.strokeStyle = PALETTE.ripple;
  ctx.lineWidth = 1.5;
  const step = 70;
  const startX = Math.floor((camX - 80) / step) * step;
  for (let wx = startX; wx < camX + W + 80; wx += step) {
    for (let row = 0; row < 7; row++) {
      const h = hash2(wx, row);
      const y = top + 18 + row * 46 + h * 20;
      const x = wx + h * 50 + ((t * 18) % step) - camX;
      const len = 14 + h * 22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y - 2.5, x + len, y);
      ctx.stroke();
    }
  }
}

function drawQuays(ctx, art, run, t, camX) {
  const off = camX % COBBLE_TILE;
  // far quay
  const farH = LAYOUT.waterTop - LAYOUT.farQuayTop;
  for (let x = -off; x < W; x += COBBLE_TILE) ctx.drawImage(art.cobbles, 0, 0, COBBLE_TILE, farH, x, LAYOUT.farQuayTop, COBBLE_TILE, farH);
  // near quay
  const nearH = LAYOUT.nearQuayBottom - LAYOUT.waterBottom;
  for (let x = -off; x < W; x += COBBLE_TILE) ctx.drawImage(art.cobbles, 0, 0, COBBLE_TILE, nearH, x, LAYOUT.waterBottom, COBBLE_TILE, nearH);
  // brass-capped quay edges
  ctx.fillStyle = PALETTE.quayEdge;
  ctx.fillRect(0, LAYOUT.waterTop - 5, W, 5);
  ctx.fillRect(0, LAYOUT.waterBottom, W, 5);
  ctx.fillStyle = 'rgba(255,230,160,0.35)';
  ctx.fillRect(0, LAYOUT.waterTop - 5, W, 1);
  ctx.fillRect(0, LAYOUT.waterBottom, W, 1);
  // edge shadow on the water
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, LAYOUT.waterTop, W, 6);

  // lamp posts on the far quay with warm pools of light
  for (const lamp of run.stretch.lamps) {
    const sx = lamp.x - camX;
    if (sx < -60 || sx > W + 60) continue;
    const flicker = 0.85 + 0.15 * Math.sin(t * 7 + lamp.flicker);
    const pool = ctx.createRadialGradient(sx, LAYOUT.farQuayTop + 18, 2, sx, LAYOUT.farQuayTop + 18, 60);
    pool.addColorStop(0, `rgba(255, 190, 100, ${0.45 * flicker})`);
    pool.addColorStop(1, 'rgba(255, 190, 100, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(sx - 60, LAYOUT.farQuayTop - 40, 120, 100);
    ctx.fillStyle = '#15130f';
    ctx.fillRect(sx - 1.5, LAYOUT.farQuayTop - 22, 3, 40);
    ctx.fillStyle = PALETTE.windowHot;
    ctx.beginPath(); ctx.arc(sx, LAYOUT.farQuayTop - 24, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // bollards on the near quay
  ctx.fillStyle = '#17161c';
  for (let wx = Math.floor(camX / 180) * 180; wx < camX + W + 180; wx += 180) {
    const sx = wx - camX + 40;
    ctx.beginPath(); ctx.arc(sx, LAYOUT.waterBottom + 16, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.brassDark;
    ctx.fillRect(sx - 6, LAYOUT.waterBottom + 15, 12, 2);
    ctx.fillStyle = '#17161c';
  }
}

function drawLanding(ctx, run, t, camX) {
  const dock = run.stretch.dock;
  const sx = dock.x - camX;
  if (sx < -200 || sx > W + 200) return;
  const far = dock.side === 'far';
  const edgeY = far ? LAYOUT.waterTop : LAYOUT.waterBottom;
  const dir = far ? 1 : -1;

  // the glow on the water: where docking is possible
  const pulse = 0.75 + 0.25 * Math.sin(t * 3);
  const glow = ctx.createRadialGradient(sx, dock.y, 6, sx, dock.y, TUNING.dockRadius + 20);
  glow.addColorStop(0, `rgba(255, 216, 120, ${0.5 * pulse})`);
  glow.addColorStop(0.7, `rgba(255, 190, 80, ${0.22 * pulse})`);
  glow.addColorStop(1, 'rgba(255, 190, 80, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sx, dock.y, TUNING.dockRadius + 20, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 20;
  ctx.strokeStyle = `rgba(255, 231, 163, ${0.8 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(sx, dock.y, TUNING.dockRadius, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // the pier: planks reaching into the water, brass posts with lanterns
  const pierLen = 34;
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(sx - 46, far ? edgeY : edgeY - pierLen, 92, pierLen);
  ctx.strokeStyle = '#2c1d12';
  ctx.lineWidth = 1;
  for (let px = sx - 46; px <= sx + 46; px += 9) {
    ctx.beginPath(); ctx.moveTo(px, far ? edgeY : edgeY - pierLen); ctx.lineTo(px, far ? edgeY + pierLen : edgeY); ctx.stroke();
  }
  for (const px of [sx - 44, sx + 44]) {
    const py = edgeY + dir * pierLen;
    ctx.fillStyle = PALETTE.brass;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    const lg = ctx.createRadialGradient(px, py, 1, px, py, 22);
    lg.addColorStop(0, 'rgba(255,230,150,0.9)');
    lg.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
  }
  // sign
  const signY = far ? LAYOUT.farQuayTop - 6 : LAYOUT.waterBottom + 30;
  ctx.font = `bold 20px ${FONTS.serif}`;
  ctx.textAlign = 'center';
  const label = dock.label.toUpperCase();
  const tw = ctx.measureText(label).width + 22;
  ctx.fillStyle = 'rgba(20, 12, 4, 0.85)';
  roundRect(ctx, sx - tw / 2, signY - 18, tw, 28, 6);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.goldLight;
  ctx.fillText(label, sx, signY + 3);
}

function drawWhirlpools(ctx, run, camX) {
  for (const pool of run.stretch.whirlpools) {
    const sx = pool.x - camX;
    if (sx < -120 || sx > W + 120) continue;
    const dark = ctx.createRadialGradient(sx, pool.y, 2, sx, pool.y, pool.r * 1.6);
    dark.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    dark.addColorStop(0.45, 'rgba(1, 14, 18, 0.55)');
    dark.addColorStop(1, 'rgba(1, 14, 18, 0)');
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(sx, pool.y, pool.r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5;
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let k = 0; k <= 26; k++) {
        const f = k / 26;
        const a = pool.spin + arm * (Math.PI / 2) + f * 4.2;
        const r = pool.r * (1.35 - f * 1.15);
        const x = sx + Math.cos(a) * r;
        const y = pool.y + Math.sin(a) * r * 0.82;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = arm % 2 ? 'rgba(110, 210, 205, 0.55)' : 'rgba(240, 200, 120, 0.35)';
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.dangerSoft;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, pool.y, pool.r * 0.55, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawLeaves(ctx, run, t, camX) {
  for (const leaf of run.stretch.leaves) {
    if (leaf.taken) continue;
    const sx = leaf.x - camX;
    if (sx < -30 || sx > W + 30) continue;
    const y = leaf.y + Math.sin(leaf.phase) * 4;
    drawGiltLeaf(ctx, sx, y, Math.sin(leaf.phase * 0.7) * 0.6 + 0.4, 1, t + leaf.x);
  }
}

/** A gilt leaf: pointed oval with a vein and a moving glint. */
export function drawGiltLeaf(ctx, x, y, angle, scale, glintTime) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
  halo.addColorStop(0, 'rgba(255, 220, 120, 0.45)');
  halo.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createLinearGradient(-12, -6, 12, 6);
  grad.addColorStop(0, PALETTE.goldLight);
  grad.addColorStop(0.5, PALETTE.gold);
  grad.addColorStop(1, PALETTE.goldDark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.quadraticCurveTo(0, -10, 13, 0);
  ctx.quadraticCurveTo(0, 10, -13, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(110, 70, 10, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(15, 0); ctx.stroke();
  const glint = Math.sin(glintTime * 2.2);
  if (glint > 0.7) {
    ctx.fillStyle = `rgba(255,255,240,${(glint - 0.7) * 3})`;
    ctx.beginPath(); ctx.arc(4, -3, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCogShadows(ctx, run, camX) {
  for (const cog of run.stretch.cogs) {
    const sx = cog.x - camX;
    if (cog.landed) {
      // ripple rings where it went under
      ctx.strokeStyle = `rgba(160, 220, 220, ${0.6 * (1 - cog.sink)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, cog.y, cog.r + cog.sink * 30, (cog.r + cog.sink * 30) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1 - cog.sink;
      drawCog(ctx, sx, cog.y, cog.r * (1 - cog.sink * 0.5), cog.spin);
      ctx.globalAlpha = 1;
      continue;
    }
    const k = cog.t / cog.fall;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + 0.4 * k})`;
    ctx.beginPath(); ctx.ellipse(sx, cog.y, cog.r * (0.5 + 0.5 * k), cog.r * 0.6 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 106, 74, ${0.4 + 0.5 * Math.abs(Math.sin(cog.t * 12))})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(sx, cog.y, cog.r + 4, (cog.r + 4) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawFallingCogs(ctx, run, camX) {
  for (const cog of run.stretch.cogs) {
    if (cog.landed) continue;
    const k = cog.t / cog.fall;
    const height = (1 - k * k) * 300;
    drawCog(ctx, cog.x - camX, cog.y - height, cog.r * (1.25 - 0.25 * k), cog.spin);
  }
}

/** An iron cog with a brass rim and eight teeth. */
export function drawCog(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = PALETTE.iron;
  ctx.beginPath();
  const teeth = 8;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.78;
    ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.brass;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.ironDark;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.brassLight;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBarges(ctx, run, camX) {
  for (const barge of run.stretch.barges) {
    if (barge.fade <= 0) continue;
    const sx = barge.x - camX;
    if (sx + barge.len < -40 || sx > W + 40) continue;
    drawBarge(ctx, sx, barge.y, barge.len, barge.wid, barge.oncoming, barge.lampPhase, barge.fade);
  }
}

/** A canal barge seen from above: tarred hull, cabin, cargo, a red lamp at the bow. */
export function drawBarge(ctx, x, y, len, wid, facingLeft, lampPhase, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + len / 2, y);
  if (facingLeft) ctx.scale(-1, 1);
  const half = len / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, -half + 4, -wid / 2 + 6, len, wid, 14); ctx.fill();
  ctx.fillStyle = PALETTE.bargeHull;
  ctx.beginPath();
  ctx.moveTo(-half, -wid / 2 + 4);
  ctx.lineTo(half - 22, -wid / 2);
  ctx.quadraticCurveTo(half + 6, 0, half - 22, wid / 2);
  ctx.lineTo(-half, wid / 2 - 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.brassDark;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.bargeDeck;
  ctx.fillRect(-half + 8, -wid / 2 + 7, len - 34, wid - 14);
  // cargo crates
  ctx.fillStyle = '#7a5532';
  for (let cx = -half + 44; cx < half - 50; cx += 24) ctx.fillRect(cx, -wid / 2 + 10, 18, wid - 20);
  // cabin at the stern
  ctx.fillStyle = '#2a1c12';
  ctx.fillRect(-half + 10, -wid / 2 + 8, 28, wid - 16);
  ctx.fillStyle = PALETTE.window;
  ctx.fillRect(-half + 16, -4, 6, 8);
  // bow lamp
  const lampGlow = 0.6 + 0.4 * Math.sin(lampPhase);
  const lg = ctx.createRadialGradient(half - 14, 0, 1, half - 14, 0, 30);
  lg.addColorStop(0, `rgba(255, 110, 60, ${0.85 * lampGlow})`);
  lg.addColorStop(1, 'rgba(255, 110, 60, 0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(half - 14, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.bargeLamp;
  ctx.beginPath(); ctx.arc(half - 14, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawWake(ctx, boat, camX) {
  const wake = boat.wake;
  if (wake.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 1; i < wake.length; i++) {
    const a = wake[i - 1];
    const b = wake[i];
    const fade = Math.max(0, 1 - b.age / 1.3);
    const color = b.boosted ? '255, 236, 160' : '242, 193, 78';
    // the two spreading arms of the wake
    ctx.strokeStyle = `rgba(${color}, ${0.5 * fade})`;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a.x - camX, a.y + side * a.spread);
      ctx.lineTo(b.x - camX, b.y + side * b.spread);
      ctx.stroke();
    }
    // the glowing core line
    ctx.strokeStyle = `rgba(${color}, ${0.35 * fade})`;
    ctx.lineWidth = 6 * fade + 1;
    ctx.beginPath();
    ctx.moveTo(a.x - camX, a.y);
    ctx.lineTo(b.x - camX, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The gilded paper boat in profile: raised folded ends, a tall centre fold, a glow beneath. */
export function drawBoat(ctx, boat, camX, t) {
  const sx = boat.x - camX;
  const bob = Math.sin(boat.bob * 3) * 1.5;
  if (boat.invuln > 0 && Math.floor(boat.invuln * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(sx, boat.y + bob);
  // lean into turns a little, roll over when sinking
  const lean = Math.max(-0.35, Math.min(0.35, boat.heading * 0.8));
  ctx.rotate(lean + Math.sin(boat.bob * 2.2) * 0.04 + boat.sinking * 0.9);
  const scale = 0.5 * (1 - boat.sinking * 0.55);
  ctx.globalAlpha = 1 - boat.sinking * 0.8;

  const halo = ctx.createRadialGradient(0, 4, 4, 0, 4, 44);
  halo.addColorStop(0, `rgba(255, 214, 120, ${boat.boost > 0 ? 0.6 : 0.36})`);
  halo.addColorStop(1, 'rgba(255, 214, 120, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 4, 44, 0, Math.PI * 2); ctx.fill();
  ctx.scale(scale, scale);
  drawPaperBoatProfile(ctx);
  ctx.restore();
}

/** Paper boat silhouette centred on its waterline, about 124 wide and 70 tall. */
function drawPaperBoatProfile(ctx) {
  // reflection on the water
  ctx.save();
  ctx.globalAlpha *= 0.3;
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(-42, 12); ctx.lineTo(42, 12); ctx.lineTo(30, 30); ctx.lineTo(-30, 30); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // hull: the folded brim with raised ends
  const hull = ctx.createLinearGradient(0, -14, 0, 14);
  hull.addColorStop(0, PALETTE.goldLight);
  hull.addColorStop(0.55, PALETTE.gold);
  hull.addColorStop(1, PALETTE.goldDark);
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-62, -14);
  ctx.lineTo(-28, -2);
  ctx.lineTo(28, -2);
  ctx.lineTo(62, -14);
  ctx.lineTo(42, 12);
  ctx.lineTo(-42, 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // the tall centre fold: lit face and shaded face
  ctx.fillStyle = PALETTE.paper;
  ctx.beginPath(); ctx.moveTo(-30, -2); ctx.lineTo(0, -54); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8c878';
  ctx.beginPath(); ctx.moveTo(0, -54); ctx.lineTo(30, -2); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, -54); ctx.lineTo(0, -2); ctx.moveTo(-56, -10); ctx.lineTo(-36, 10); ctx.moveTo(56, -10); ctx.lineTo(36, 10); ctx.stroke();
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-30, -2); ctx.lineTo(0, -54); ctx.lineTo(30, -2); ctx.stroke();
}

function drawBridges(ctx, run, t, camX) {
  for (const bridge of run.stretch.bridges) {
    const sx = bridge.x - camX;
    if (sx < -120 || sx > W + 120) continue;
    const half = bridge.width / 2;
    // shadow cast on the water
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(sx - half + 10, LAYOUT.waterTop, bridge.width + 10, LAYOUT.waterBottom - LAYOUT.waterTop);
    // brass deck
    const deck = ctx.createLinearGradient(sx - half, 0, sx + half, 0);
    deck.addColorStop(0, PALETTE.brassDark);
    deck.addColorStop(0.25, PALETTE.brass);
    deck.addColorStop(0.55, PALETTE.brassLight);
    deck.addColorStop(1, PALETTE.brassDark);
    ctx.fillStyle = deck;
    ctx.fillRect(sx - half, LAYOUT.farQuayTop + 8, bridge.width, LAYOUT.waterBottom + 30 - LAYOUT.farQuayTop);
    ctx.fillStyle = '#2b1d08';
    ctx.fillRect(sx - half - 3, LAYOUT.farQuayTop + 8, 4, LAYOUT.waterBottom + 30 - LAYOUT.farQuayTop);
    ctx.fillRect(sx + half - 1, LAYOUT.farQuayTop + 8, 4, LAYOUT.waterBottom + 30 - LAYOUT.farQuayTop);
    // rivets and cross-girders
    ctx.fillStyle = 'rgba(60, 40, 10, 0.8)';
    for (let y = LAYOUT.waterTop + 10; y < LAYOUT.waterBottom + 20; y += 26) {
      ctx.fillRect(sx - half + 2, y, bridge.width - 4, 2);
      ctx.fillStyle = PALETTE.brassLight;
      ctx.fillRect(sx - half + 5, y - 4, 2, 2);
      ctx.fillRect(sx + half - 7, y - 4, 2, 2);
      ctx.fillStyle = 'rgba(60, 40, 10, 0.8)';
    }
    // the clock tower on the far quay
    const cy = LAYOUT.farQuayTop - 34;
    ctx.fillStyle = '#1b140a';
    ctx.fillRect(sx - 20, cy - 16, 40, 58);
    ctx.fillStyle = PALETTE.brass;
    ctx.beginPath(); ctx.moveTo(sx - 24, cy - 16); ctx.lineTo(sx, cy - 40); ctx.lineTo(sx + 24, cy - 16); ctx.closePath(); ctx.fill();
    const face = ctx.createRadialGradient(sx, cy + 4, 2, sx, cy + 4, 34);
    face.addColorStop(0, 'rgba(255, 230, 160, 0.6)');
    face.addColorStop(1, 'rgba(255, 230, 160, 0)');
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(sx, cy + 4, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbefc9';
    ctx.beginPath(); ctx.arc(sx, cy + 4, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PALETTE.brassDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#2a1a06';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, cy + 4); ctx.lineTo(sx + Math.cos(bridge.clockPhase) * 10, cy + 4 + Math.sin(bridge.clockPhase) * 10);
    ctx.moveTo(sx, cy + 4); ctx.lineTo(sx + Math.cos(bridge.clockPhase / 12) * 6, cy + 4 + Math.sin(bridge.clockPhase / 12) * 6);
    ctx.stroke();
    // exposed gears turning beside the face
    drawCog(ctx, sx + 18, cy + 30, 9, t * 1.5 + bridge.x);
    drawCog(ctx, sx - 16, cy + 34, 7, -t * 2 + bridge.x);
  }
}

function drawBoomOrGate(ctx, run, camX) {
  const stretch = run.stretch;
  const sx = stretch.boomX - camX;
  if (sx < -80 || sx > W + 80) return;
  if (stretch.finalGate) {
    // the flood gate: two great riveted brass leaves
    const gate = ctx.createLinearGradient(sx - 10, 0, sx + 40, 0);
    gate.addColorStop(0, PALETTE.brassDark);
    gate.addColorStop(0.5, PALETTE.brass);
    gate.addColorStop(1, '#3a2808');
    ctx.fillStyle = gate;
    ctx.fillRect(sx - 6, LAYOUT.farQuayTop - 40, 46, LAYOUT.nearQuayBottom - LAYOUT.farQuayTop + 40);
    ctx.fillStyle = 'rgba(40, 25, 5, 0.9)';
    for (let y = LAYOUT.farQuayTop - 30; y < H; y += 30) ctx.fillRect(sx - 6, y, 46, 3);
    ctx.fillStyle = PALETTE.brassLight;
    for (let y = LAYOUT.farQuayTop - 20; y < H; y += 30) { ctx.fillRect(sx, y, 3, 3); ctx.fillRect(sx + 30, y, 3, 3); }
    ctx.fillStyle = '#1a1205';
    ctx.fillRect(sx + 15, LAYOUT.waterTop, 3, LAYOUT.waterBottom - LAYOUT.waterTop);
    return;
  }
  // a chain boom with floats across the canal
  ctx.strokeStyle = '#8b8d96';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = LAYOUT.waterTop; y <= LAYOUT.waterBottom; y += 8) ctx.lineTo(sx + Math.sin(y * 0.2) * 2, y);
  ctx.stroke();
  for (let y = LAYOUT.waterTop + 30; y < LAYOUT.waterBottom; y += 50) {
    ctx.fillStyle = PALETTE.danger;
    ctx.beginPath(); ctx.arc(sx, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(sx - 7, y - 1.5, 14, 3);
  }
  for (const y of [LAYOUT.waterTop - 6, LAYOUT.waterBottom + 6]) {
    ctx.fillStyle = PALETTE.brass;
    ctx.fillRect(sx - 7, y - 10, 14, 20);
  }
}

function drawParticles(ctx, run, camX) {
  for (const p of run.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - camX - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawPopups(ctx, run, camX) {
  ctx.textAlign = 'center';
  ctx.font = `bold 20px ${FONTS.serif}`;
  for (const pop of run.popups) {
    ctx.globalAlpha = Math.min(1, pop.life * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(pop.text, pop.x - camX + 1, pop.y + 2);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, pop.x - camX, pop.y);
  }
  ctx.globalAlpha = 1;
}

function drawFloodTint(ctx, run, t, view) {
  if (view.screen !== 'play' || run.timeLeft > TUNING.floodWarnSeconds) return;
  const k = 1 - run.timeLeft / TUNING.floodWarnSeconds;
  ctx.fillStyle = `rgba(160, 30, 20, ${(0.05 + 0.08 * Math.abs(Math.sin(t * 3))) * k})`;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- HUD

function drawHud(ctx, run, view) {
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, 10, 8, W - 20, 64, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  hudLabel(ctx, 'SCORE', 28, 28);
  hudValue(ctx, String(run.score), 28, 60, 30);

  // chain with its countdown bar
  hudLabel(ctx, 'LEAF CHAIN', 190, 28);
  hudValue(ctx, run.chain > 0 ? `x${Math.min(run.chain, TUNING.chainCap)}` : '—', 190, 60, 30, run.chain >= 5 ? PALETTE.goldLight : PALETTE.hudInk);
  if (run.chainTimer > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(262, 46, 70, 6);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(262, 46, 70 * (run.chainTimer / TUNING.chainWindow), 6);
  }

  // docks
  hudLabel(ctx, 'DOCKS', 368, 28);
  hudValue(ctx, `${run.docks}/${STRETCHES.length}`, 368, 60, 30);
  for (let i = 0; i < STRETCHES.length; i++) {
    ctx.fillStyle = i < run.docks ? PALETTE.gold : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(436 + i * 20, 50, 7, 0, Math.PI * 2); ctx.fill();
    if (i === run.docks) { ctx.strokeStyle = PALETTE.goldLight; ctx.lineWidth = 2; ctx.stroke(); }
  }

  // hull as little boats
  hudLabel(ctx, 'HULL', 510, 28);
  for (let i = 0; i < TUNING.hullMax; i++) drawHullPip(ctx, 532 + i * 36, 50, i < run.boat.hull);

  // flood timer
  const low = run.timeLeft <= TUNING.floodWarnSeconds;
  const secs = Math.ceil(run.timeLeft);
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  hudLabel(ctx, 'FLOOD IN', 674, 28, low ? '#ff9a80' : PALETTE.hudDim);
  hudValue(ctx, mmss, 674, 60, 30, low ? (Math.sin(view.clock * 8) > 0 ? '#ff7a5c' : '#ffd0c0') : PALETTE.hudInk);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(764, 46, 160, 8);
  ctx.fillStyle = low ? PALETTE.danger : '#6fd0d0';
  ctx.fillRect(764, 46, 160 * (run.timeLeft / TUNING.floodSeconds), 8);
  ctx.textAlign = 'right';
  ctx.font = `bold 13px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText(view.muted ? 'M: SOUND OFF' : 'M: SOUND ON', 924, 30);

  // progress toward the next landing
  const progress = stretchProgress(run);
  const px = 28;
  const pw = W - 56;
  const py = 84;
  ctx.fillStyle = 'rgba(6, 14, 24, 0.6)';
  roundRect(ctx, px - 8, py - 9, pw + 16, 18, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(242, 193, 78, 0.3)';
  ctx.fillRect(px, py - 1, pw, 3);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(px, py - 1, pw * progress, 3);
  ctx.fillStyle = PALETTE.goldLight;
  ctx.beginPath(); ctx.arc(px + pw, py, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.paper;
  ctx.beginPath(); ctx.moveTo(px + pw * progress + 8, py); ctx.lineTo(px + pw * progress - 6, py - 6); ctx.lineTo(px + pw * progress - 6, py + 6); ctx.fill();
  ctx.font = `bold 13px ${FONTS.serif}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText(`TO ${run.stretch.dock.label.toUpperCase()}`, px + pw - 12, py - 12 + 26);
  ctx.restore();
}

function hudLabel(ctx, text, x, y, color = PALETTE.hudDim) {
  ctx.textAlign = 'left';
  ctx.font = `bold 13px ${FONTS.serif}`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function hudValue(ctx, text, x, y, size, color = PALETTE.hudInk) {
  ctx.textAlign = 'left';
  ctx.font = `bold ${size}px ${FONTS.serif}`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHullPip(ctx, x, y, whole) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = whole ? PALETTE.gold : 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(-14, -3); ctx.lineTo(14, -3); ctx.lineTo(9, 7); ctx.lineTo(-9, 7); ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(0, -13); ctx.lineTo(6, -4); ctx.closePath();
  ctx.fillStyle = whole ? PALETTE.paper : 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- overlays and screens

function drawBanner(ctx, banner) {
  const a = Math.min(1, banner.t, (2.6 - banner.t) * 3);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(4, 10, 16, 0.6)';
  roundRect(ctx, W / 2 - 230, 236, 460, 96, 14);
  ctx.fill();
  ctx.font = `bold 44px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.goldLight;
  ctx.fillText(banner.title.toUpperCase(), W / 2, 282);
  ctx.font = `italic 24px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText(banner.sub, W / 2, 316);
  ctx.restore();
}

function drawDockPrompt(ctx, run) {
  const sx = run.boat.x - run.cameraX;
  const y = run.stretch.dock.side === 'far' ? run.boat.y + 52 : run.boat.y - 40;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `bold 20px ${FONTS.serif}`;
  const text = 'SPACE / CLICK — DOCK';
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = 'rgba(20, 12, 4, 0.85)';
  roundRect(ctx, sx - w / 2, y - 22, w, 32, 8);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.goldLight;
  ctx.fillText(text, sx, y);
  ctx.restore();
}

function drawDockingCard(ctx, run) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(4, 10, 16, 0.55)';
  roundRect(ctx, W / 2 - 250, 250, 500, 84, 14);
  ctx.fill();
  ctx.font = `bold 40px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.goldLight;
  ctx.fillText(`${run.stretch.dock.label.toUpperCase()} REACHED`, W / 2, 292);
  ctx.font = `22px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText('The dock bell rings across the water.', W / 2, 320);
  ctx.restore();
}

function drawPauseOverlay(ctx) {
  ctx.fillStyle = 'rgba(2, 6, 12, 0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = `bold 64px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.goldLight;
  ctx.fillText('PAUSED', W / 2, 290);
  ctx.font = `24px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText('P to resume  ·  R to restart  ·  M to mute', W / 2, 336);
}

function drawVignette(ctx, strength) {
  const v = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 620);
  v.addColorStop(0, 'rgba(2, 6, 12, 0)');
  v.addColorStop(1, `rgba(2, 6, 12, ${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawGildedTitle(ctx, text, x, y, size) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `bold ${size}px ${FONTS.serif}`;
  ctx.shadowColor = 'rgba(255, 200, 90, 0.75)';
  ctx.shadowBlur = 28;
  const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y + 6);
  g.addColorStop(0, '#fff6cf');
  g.addColorStop(0.45, PALETTE.gold);
  g.addColorStop(1, '#9a6612');
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(60, 35, 5, 0.9)';
  ctx.strokeText(text, x, y);
  ctx.restore();
}

function drawTitleScreen(ctx, view) {
  ctx.fillStyle = 'rgba(2, 6, 12, 0.45)';
  ctx.fillRect(0, 0, W, H);
  drawVignette(ctx, 0.75);
  drawGildedTitle(ctx, 'GILTWAKE', W / 2, 168, 116);

  ctx.textAlign = 'center';
  ctx.font = `italic 26px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText('Steer a gilded paper boat down the moonlit Brass Canal —', W / 2, 220);
  ctx.fillText('dock at all three landings before the flood gate shuts.', W / 2, 252);

  // controls card
  ctx.fillStyle = 'rgba(6, 14, 24, 0.82)';
  roundRect(ctx, 66, 280, W - 132, 196, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const rows = [
    ['MOUSE', 'steer toward the cursor'],
    ['WASD / ARROWS', 'fine-steer'],
    ['SPACE / CLICK', 'dock inside a landing glow'],
    ['P  ·  M  ·  R', 'pause  ·  mute  ·  restart'],
  ];
  rows.forEach(([key, what], i) => {
    const y = 318 + i * 40;
    ctx.textAlign = 'right';
    ctx.font = `bold 21px ${FONTS.serif}`;
    ctx.fillStyle = PALETTE.goldLight;
    ctx.fillText(key, 300, y);
    ctx.textAlign = 'left';
    ctx.font = `21px ${FONTS.serif}`;
    ctx.fillStyle = PALETTE.hudInk;
    ctx.fillText(what, 318, y);
  });
  // legend: what to chase and what to dodge
  const lx = 630;
  drawGiltLeaf(ctx, lx, 312, 0.3, 1.1, view.clock);
  legendText(ctx, 'gilt leaves: chain, boost', lx + 24, 318, PALETTE.goldLight);
  drawMiniWhirl(ctx, lx, 352, view.clock);
  legendText(ctx, 'whirlpools', lx + 24, 358, '#ffb3a0');
  drawCog(ctx, lx, 392, 11, view.clock);
  legendText(ctx, 'falling cogs', lx + 24, 398, '#ffb3a0');
  drawBarge(ctx, lx - 16, 432, 34, 14, false, view.clock * 3, 1);
  legendText(ctx, 'barges', lx + 24, 438, '#ffb3a0');

  drawHeroBoat(ctx, 120, 520, view.clock);
  drawHeroBoat(ctx, W - 120, 520, view.clock + 1.7, true);
  const pulse = 0.82 + 0.18 * Math.sin(view.clock * 3.2);
  ctx.textAlign = 'center';
  ctx.font = `bold 32px ${FONTS.serif}`;
  ctx.fillStyle = `rgba(255, 231, 163, ${pulse})`;
  ctx.fillText('Press Enter or click to start', W / 2, 532);
  ctx.font = `16px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText('3 hits sink the boat  ·  the flood comes in under two minutes', W / 2, 566);
}

/** A large gilded boat with a painted wake, decorating the title screen. */
function drawHeroBoat(ctx, x, y, t, mirrored = false) {
  ctx.save();
  ctx.translate(x, y);
  if (mirrored) ctx.scale(-1, 1);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(242, 193, 78, ${0.42 - i * 0.09})`;
    ctx.lineWidth = 3 - i * 0.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-30 - i * 4, side * (6 + i * 2));
      ctx.quadraticCurveTo(-70 - i * 10, side * (14 + i * 8 + Math.sin(t * 2 + i) * 2), -110 - i * 6, side * (22 + i * 12));
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, 90);
  halo.addColorStop(0, 'rgba(255, 214, 120, 0.4)');
  halo.addColorStop(1, 'rgba(255, 214, 120, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, Math.sin(t * 2) * 2);
  ctx.rotate(Math.sin(t * 1.4) * 0.04);
  ctx.scale(0.95, 0.95);
  drawPaperBoatProfile(ctx);
  ctx.restore();
}

function legendText(ctx, text, x, y, color) {
  ctx.textAlign = 'left';
  ctx.font = `19px ${FONTS.serif}`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawMiniWhirl(ctx, x, y, t) {
  ctx.save();
  ctx.lineWidth = 2;
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let k = 0; k <= 14; k++) {
      const f = k / 14;
      const a = t * 2.4 + arm * 2.1 + f * 4;
      const r = 13 * (1.1 - f);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
    }
    ctx.strokeStyle = arm % 2 ? 'rgba(110, 210, 205, 0.9)' : 'rgba(240, 200, 120, 0.7)';
    ctx.stroke();
  }
  ctx.restore();
}

const CARD = { x: 50, y: 150, w: 560, h: 360 };
const CARD_MID = CARD.x + CARD.w / 2;

function resultCard(ctx, headline, sub, rows, accent) {
  ctx.fillStyle = 'rgba(4, 9, 16, 0.84)';
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 18);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `bold 40px ${FONTS.serif}`;
  ctx.fillStyle = accent;
  ctx.fillText(headline, CARD_MID, 204);
  ctx.font = `italic 24px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudInk;
  ctx.fillText(sub, CARD_MID, 240);
  rows.forEach(([label, value], i) => {
    const y = 292 + i * 36;
    ctx.textAlign = 'right';
    ctx.font = `21px ${FONTS.serif}`;
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(label, CARD.x + 190, y);
    ctx.textAlign = 'left';
    ctx.font = `bold ${i === 0 ? 34 : 22}px ${FONTS.serif}`;
    ctx.fillStyle = i === 0 ? PALETTE.goldLight : PALETTE.hudInk;
    ctx.fillText(value, CARD.x + 208, y + (i === 0 ? 4 : 0));
  });
}

function drawRestartButton(ctx, clock) {
  const pulse = 0.8 + 0.2 * Math.sin(clock * 3.2);
  ctx.fillStyle = `rgba(242, 193, 78, ${pulse})`;
  roundRect(ctx, CARD_MID - 220, 440, 440, 50, 12);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `bold 25px ${FONTS.serif}`;
  ctx.fillStyle = '#1a1105';
  ctx.fillText('RESTART  —  press R or click', CARD_MID, 474);
}

function drawWinScreen(ctx, run, view) {
  ctx.fillStyle = 'rgba(40, 20, 30, 0.25)';
  ctx.fillRect(0, 0, W, H);
  drawGildedTitle(ctx, 'GILTWAKE', CARD_MID, 118, 72);
  const r = run.result || { timeBonus: 0, hullBonus: 0 };
  resultCard(ctx, 'The gate holds.', 'Dawn on the brass water.', [
    ['Score', String(run.score)],
    ['Landings', `${run.docks}/${STRETCHES.length}  ·  leaves ${run.leavesTaken}`],
    ['Bonus', `time +${r.timeBonus}  ·  hull +${r.hullBonus}`],
    ['Best chain', `x${run.bestChain}`],
  ], PALETTE.goldLight);
  drawRestartButton(ctx, view.clock);
  footer(ctx, view);
}

function drawLoseScreen(ctx, run, view) {
  ctx.fillStyle = 'rgba(30, 6, 6, 0.45)';
  ctx.fillRect(0, 0, W, H);
  drawVignette(ctx, 0.7);
  drawGildedTitle(ctx, 'GILTWAKE', CARD_MID, 118, 72);
  const why = run.loseReason === 'flood' ? 'The flood gate shut before the last landing.' : 'Three cracks — the paper hull gave way.';
  resultCard(ctx, 'The canal takes the gilt.', why, [
    ['Score', String(run.score)],
    ['Landings', `${run.docks}/${STRETCHES.length}  ·  lost on stretch ${ROMAN[Math.min(run.docks, 2)]}`],
    ['Leaves', `${run.leavesTaken}  ·  best chain x${run.bestChain}`],
  ], '#ff9a7a');
  drawRestartButton(ctx, view.clock);
  footer(ctx, view);
}

function footer(ctx, view) {
  ctx.textAlign = 'center';
  ctx.font = `17px ${FONTS.serif}`;
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText(`Enter for title  ·  M ${view.muted ? 'unmute' : 'mute'}`, CARD_MID, 548);
}

// ---------------------------------------------------------------- helpers

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
