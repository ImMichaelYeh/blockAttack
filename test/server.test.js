import test from 'node:test';
import assert from 'node:assert/strict';
import { server, publicPath } from '../tools/serve.mjs';

test('preview serves game modules and refuses repository/test files', async () => {
  assert.equal(publicPath('/.git/config'), null);
  assert.equal(publicPath('/test/fixtures/snes-expanded-results.json'), null);
  assert.equal(publicPath('/src/%2e%2e/package.json'), null);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/', '/blockAttack/', '/src/main.js', '/blockAttack/src/engine.js', '/style.css', '/game.js', '/blockAttack/game.js']) {
      const response = await fetch(base + route); assert.equal(response.status, 200, route);
    }
    for (const file of ['puzzlemenu.ogg','DavidKBD - 07 - Long Summer Nights.ogg']) {
      const response=await fetch(base+'/blockAttack/assets/music/'+encodeURIComponent(file));
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/ogg');
      assert.ok((await response.arrayBuffer()).byteLength>800000);
    }
    const credits=await fetch(base+'/assets/music/CREDITS.txt');assert.equal(credits.status,200);
    assert.match(await credits.text(),/David KBD/);
    assert.equal(publicPath('/assets/music/unknown.ogg'),null);
    for (const route of ['/.git/config', '/package.json', '/PLAN.md', '/%E0%A4%A', '/src/../package.json']) assert.equal((await fetch(base + route)).status, 404, route);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
