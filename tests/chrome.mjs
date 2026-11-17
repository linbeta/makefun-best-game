// Tiny Chrome DevTools Protocol helper for Giltwake's browser tests (Node 22+, no dependencies).
// Launches the installed Google Chrome headless, attaches to its first page, and sends real input
// through Input.dispatchMouseEvent / Input.dispatchKeyEvent (trusted events, same path as a player).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_BIN ?? '/usr/bin/google-chrome';

export async function launchChrome({ width = 1200, height = 600 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'giltwake-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const browserWs = await new Promise((resolve, reject) => {
    let err = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${err}`)), 20000);
    proc.stderr.on('data', (chunk) => {
      err += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${err}`)); });
  });
  const httpBase = browserWs.replace(/^ws:/, 'http:').replace(/\/devtools\/.*$/, '');
  const targets = await (await fetch(`${httpBase}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const client = await connect(page.webSocketDebuggerUrl);

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });

  return {
    client,
    async goto(url) {
      const loaded = client.once('Page.loadEventFired');
      await client.send('Page.navigate', { url });
      await loaded;
    },
    async evaluate(expression) {
      const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(`page error: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
      return result.result.value;
    },
    async mouseMove(x, y) {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    },
    async click(x, y) {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    },
    async key(code, key, keyCode) {
      const base = { code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key.length === 1 ? key : undefined });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async close() {
      client.close();
      proc.kill('SIGKILL');
      await new Promise((resolve) => (proc.exitCode !== null ? resolve() : proc.once('exit', resolve)));
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('CDP connect failed')); });
  let nextId = 1;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message}`));
      else resolve(data.result);
    } else if (data.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === data.method) { waiters[i].resolve(data.params); waiters.splice(i, 1); }
      }
    }
  };
  return {
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    once(method) {
      return new Promise((resolve) => waiters.push({ method, resolve }));
    },
    close() { ws.close(); },
  };
}
