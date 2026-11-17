// Giltwake — keyboard and mouse. Held keys for steering, one-shot presses for menu actions.

const STEER_KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};

const ACTION_KEYS = {
  Enter: 'start', NumpadEnter: 'start',
  Space: 'dock',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
  KeyR: 'restart',
};

export function createInput(canvas, viewWidth, viewHeight) {
  const held = { left: false, right: false, up: false, down: false };
  const pressed = new Set();
  const mouse = { x: viewWidth * 0.5, y: viewHeight * 0.5, inside: false, lastMove: -1e9 };
  let lastSteerKey = -1e9;
  let firstGestureHandlers = [];

  function fireGesture() {
    const handlers = firstGestureHandlers;
    firstGestureHandlers = [];
    handlers.forEach((fn) => fn());
  }

  window.addEventListener('keydown', (event) => {
    const steer = STEER_KEYS[event.code];
    const action = ACTION_KEYS[event.code];
    if (steer) { held[steer] = true; lastSteerKey = performance.now(); }
    if (action && !event.repeat) pressed.add(action);
    if (steer || action) event.preventDefault();
    fireGesture();
  });
  window.addEventListener('keyup', (event) => {
    const steer = STEER_KEYS[event.code];
    if (steer) held[steer] = false;
  });
  window.addEventListener('blur', () => {
    held.left = held.right = held.up = held.down = false;
    pressed.add('blur');
  });

  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * viewWidth;
    mouse.y = ((event.clientY - rect.top) / rect.height) * viewHeight;
  }
  canvas.addEventListener('mousemove', (event) => {
    toCanvas(event);
    mouse.inside = true;
    mouse.lastMove = performance.now();
  });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
  canvas.addEventListener('mousedown', (event) => {
    toCanvas(event);
    mouse.inside = true;
    mouse.lastMove = performance.now();
    pressed.add('click');
    fireGesture();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    mouse,
    /** Was this one-shot action pressed since the last frame? */
    took: (action) => pressed.has(action),
    endFrame: () => pressed.clear(),
    /** -1..1 per axis from the held keys. */
    keyAxis: () => ({
      x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
      y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
    }),
    /** The mouse steers while it is over the canvas, unless a steering key was pressed after it last moved. */
    mouseSteering: () => mouse.inside && mouse.lastMove > lastSteerKey,
    onFirstGesture: (fn) => firstGestureHandlers.push(fn),
  };
}
