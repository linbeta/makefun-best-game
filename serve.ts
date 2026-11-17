// Giltwake — a small static file server for local play (Node 22+, standard library only).
// Serves game/ on 127.0.0.1, port 8080 by default:  node serve.ts [--port 8765]
// Development convenience only: it refuses paths outside game/ and does nothing else.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function portFromArgs(argv: string[]): number {
  const at = argv.indexOf('--port');
  const value = at >= 0 ? Number(argv[at + 1]) : 8080;
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function resolveRequest(rawUrl: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(gameRoot, '.' + path);
  return file === gameRoot || file.startsWith(gameRoot + sep) ? file : null;
}

const port = portFromArgs(process.argv.slice(2));

createServer((request, response) => {
  const file = resolveRequest(request.url ?? '/');
  if (!file) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size = 0;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Giltwake is on http://127.0.0.1:${port}/`);
});
