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
    for (const route of ['/.git/config', '/package.json', '/PLAN.md', '/%E0%A4%A', '/src/../package.json']) assert.equal((await fetch(base + route)).status, 404, route);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
