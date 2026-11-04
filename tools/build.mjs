import { cp, mkdir, rm } from 'node:fs/promises';
import './bundle.mjs';
const output = new URL('../dist/', import.meta.url);
await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });
for (const entry of ['index.html', 'style.css', 'game.js']) await cp(new URL(`../${entry}`, import.meta.url), new URL(entry, output), { recursive: true });
console.log('Built dist/: original game files only.');
