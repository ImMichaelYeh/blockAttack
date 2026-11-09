import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './bundle.mjs';
import { MUSIC_TRACKS } from '../src/audio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8' };
const publicFiles = ['index.html', 'style.css', 'game.js', 'assets/music/CREDITS.txt', ...Object.values(MUSIC_TRACKS).map(track => track.src.slice(2))];
export function publicPath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const local = pathname.startsWith('/blockAttack/') ? pathname.slice('/blockAttack'.length) : pathname;
  const name = local === '/' ? 'index.html' : local.slice(1);
  if (!publicFiles.includes(name) && !/^src\/[a-z-]+\.js$/.test(name)) return null;
  return path.join(root, name);
}

export const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    const target = publicPath(request.url);
    if (!target || !(await stat(target)).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404); response.end('Not found'); }
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/blockAttack/`));
}
