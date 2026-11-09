import { cp, mkdir, rm } from 'node:fs/promises';
import './bundle.mjs';
import { MUSIC_TRACKS } from '../src/audio.js';
const output = new URL('../dist/', import.meta.url);
await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });
for (const entry of ['index.html', 'style.css', 'game.js']) await cp(new URL(`../${entry}`, import.meta.url), new URL(entry, output), { recursive: true });
await mkdir(new URL('assets/music/', output), { recursive: true });
for (const entry of [...Object.values(MUSIC_TRACKS).map(track => track.src), './assets/music/CREDITS.txt']) {
  await cp(new URL(`../${entry}`, import.meta.url), new URL(entry, output));
}
console.log('Built dist/: game and licensed music.');
