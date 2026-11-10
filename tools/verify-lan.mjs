// Isolated real-Chrome test: two game documents and an actual WebRTC data channel.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundle } from './bundle.mjs';
import { publicPath } from './serve.mjs';

const root = resolve('test-results/lan-browser');
await mkdir(root, { recursive: true });
let source = await bundle();
source = source.replace("window.addEventListener('blur', () => { clearInputs(); pauseGame(); audio.stop(); });", '');
source = source.replace('peer.verify({ match: session.match, stars: session.stars, points: session.points, introAge });', 'globalThis.qaSnapshots.set(peer.nextTick, JSON.stringify({match:session.match,stars:session.stars,points:session.points,introAge})); peer.verify({ match: session.match, stars: session.stars, points: session.points, introAge });');
source = source.replace('updateSettings();\nshowMenuPanel(false);', 'globalThis.qaSnapshots = new Map(); globalThis.qa = {get session(){return session}, get peer(){return lan}, get paused(){return paused}, get resultShown(){return resultShown}, finish(){session.match.result="win";finish()}}; updateSettings();\nshowMenuPanel(false);');
const game = (await readFile('index.html','utf8')).replace('<script defer src="./game.js"></script>', `<script defer src="/instrumented.js"></script>`);
let harness = `<!doctype html><style>body{background:#16272d;color:white;font:16px monospace}main{display:flex;gap:16px}iframe{width:680px;height:900px;border:0}</style><p id="result">Testing real LAN pairing…</p><main><iframe id="host" src="/host"></iframe><iframe id="guest" src="/guest"></iframe></main><img src="/hold" hidden><script>
const wait=async(predicate,label)=>{const end=Date.now()+18000;while(!predicate()){if(Date.now()>end)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,20));}};
const check=(value,label)=>{if(!value)throw Error(label)};
(async()=>{
  await wait(()=>['host','guest'].every(id=>document.getElementById(id).contentWindow.qa),'game startup');
  const host=document.getElementById('host').contentWindow,guest=document.getElementById('guest').contentWindow;
  const el=(win,id)=>win.document.getElementById(id),click=(win,id)=>el(win,id).click();
  const codeSizes=[];
  const checkCode=(win,label)=>{
    const peer=win.qa.peer,description=peer.pc.localDescription;
    const before=('BA2.'+win.btoa(JSON.stringify({protocol:'block-attack-lan-2',level:peer.level,type:description.type,sdp:description.sdp}))).length;
    const code=el(win,'lan-outgoing').value;
    check(code.startsWith('BA2Z.')&&code.length<before*.9,'compressed real connection code');
    codeSizes.push(label+' '+before+'→'+code.length);
  };
  click(host,'menu-two-player');el(host,'local-red-level').value='2';el(host,'local-blue-level').value='10';click(host,'multiplayer-local');
  check(JSON.stringify(host.qa.session.levels)==='[2,10]','local setup applies independent levels');
  check(host.qa.session.match.boards[0].versusLevel===2&&host.qa.session.match.boards[1].colorCount===6,'local native profiles');
  click(host,'pause');click(host,'overlay-menu');
  for(const win of [host,guest]){
    click(win,'menu-two-player');check(!el(win,'multiplayer-screen').hidden&&el(win,'multiplayer-screen').tagName==='SECTION','two-player in-frame screen');check(el(win,'scene-viewport').contains(el(win,'multiplayer-screen')),'setup stays inside console');
    const screen=el(win,'scene-viewport').getBoundingClientRect(),button=el(win,'multiplayer-local').getBoundingClientRect();
    check(Math.abs(button.left-screen.left-screen.width*42/256)<1&&Math.abs(button.top-screen.top-screen.height*138/224)<1,'pixel menu and local button hit area align');
    click(win,'multiplayer-lan');
  }
  el(host,'lan-level').value='3';click(host,'lan-host');await wait(()=>el(host,'lan-outgoing').value,'host invitation');
  checkCode(host,'Host');
  el(guest,'lan-level').value='9';click(guest,'lan-join');el(guest,'lan-incoming').value='bad code';click(guest,'lan-connect');
  await wait(()=>el(guest,'lan-status').textContent.includes('complete'),'invalid code error');
  el(guest,'lan-incoming').value=el(host,'lan-outgoing').value;click(guest,'lan-connect');
  await wait(()=>el(guest,'lan-outgoing').value,'guest answer');
  checkCode(guest,'Join');
  el(host,'lan-incoming').value=el(guest,'lan-outgoing').value;click(host,'lan-connect');
  await wait(()=>host.qa.session&&guest.qa.session,'both matches');
  check(host.qa.peer.host&&!guest.qa.peer.host,'host and guest roles');
  check(JSON.stringify(host.qa.session.levels)==='[3,9]'&&JSON.stringify(guest.qa.session.levels)==='[3,9]','both browsers use independently chosen levels');
  check(guest.qa.session.match.boards[1].colorCount===6,'level nine includes the sixth ordinary color');
  check(el(guest,'match-title').textContent.includes('You are Blue'),'guest identity');
  host.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));
  guest.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA'}));
  await wait(()=>host.qaSnapshots.has(120)&&guest.qaSnapshots.has(120),'120 synchronized input frames');
  check(host.qaSnapshots.get(120)===guest.qaSnapshots.get(120),'identical actual game states');
  host.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}));guest.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA'}));
  click(host,'pause');await wait(()=>host.qa.paused&&guest.qa.paused,'shared pause');
  const frozen=[host.qa.session.match.tick,guest.qa.session.match.tick];await new Promise(r=>setTimeout(r,100));
  check(host.qa.session.match.tick===frozen[0]&&guest.qa.session.match.tick===frozen[1],'pause freezes both games');
  click(guest,'continue');check(guest.qa.paused,'peer cannot dismiss the host pause');
  click(host,'continue');await wait(()=>!host.qa.paused&&!guest.qa.paused,'shared resume');
  host.qa.finish();guest.qa.finish();
  await wait(()=>host.qa.resultShown&&guest.qa.resultShown,'round results');
  check(el(guest,'continue').textContent==='Wait for host','guest waits for host');
  click(host,'continue');await wait(()=>host.qa.session.round===2&&guest.qa.session.round===2,'next round');
  check(JSON.stringify(host.qa.session.levels)==='[3,9]'&&JSON.stringify(guest.qa.session.levels)==='[3,9]','rematch retains levels');
  check(JSON.stringify(host.qa.session.stars)===JSON.stringify(guest.qa.session.stars),'shared stars');
  host.qa.peer.close();await wait(()=>!guest.qa.peer&&!el(guest,'multiplayer-screen').hidden,'disconnect recovery');
  click(host,'pause');click(host,'overlay-menu');click(host,'menu-two-player');
  el(host,'local-red-level').value='9';el(host,'local-blue-level').value='10';click(host,'multiplayer-local');
  await wait(()=>host.qa.session&&host.qa.session.match.tick>=20,'local play after leaving LAN');
  click(host,'pause');click(host,'overlay-menu');click(host,'menu-two-player');
  document.body.dataset.qa='passed';document.getElementById('result').textContent='PASS: pairing, invalid codes, synchronized play, pause/resume, results, next round, disconnect. CODE SIZES: '+codeSizes.join(', ');
})().catch(error=>{document.body.dataset.qa='failed';document.getElementById('result').textContent=error.stack;}).finally(()=>fetch('/done',{method:'POST'}));
</script>`;
let held;
const server = http.createServer(async (request,response)=>{
  try {
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/hold'){held=response;return;}
    if(url.pathname==='/done'){held?.end();response.end();return;}
    if(url.pathname==='/'){response.setHeader('Content-Type','text/html');response.end(harness);return;}
    if(['/host','/guest'].includes(url.pathname)){response.setHeader('Content-Type','text/html');response.end(game);return;}
    if(url.pathname==='/instrumented.js'){response.setHeader('Content-Type','text/javascript');response.end(source);return;}
    const target=publicPath(request.url);if(!target){response.writeHead(404).end();return;}
    response.setHeader('Content-Type',target.endsWith('.css')?'text/css':target.endsWith('.ogg')?'audio/ogg':'text/plain');
    response.end(await readFile(target));
  }catch{response.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let target=`http://127.0.0.1:${server.address().port}/`;
const fileMode=process.argv.includes('--file');
if(fileMode){
  const base=pathToFileURL(resolve('.')+'/').href;
  await writeFile(resolve(root,'instrumented.js'),source);
  const fileGame=game.replace('<head>',`<head><base href="${base}">`).replace('src="/instrumented.js"','src="./test-results/lan-browser/instrumented.js"');
  await writeFile(resolve(root,'game.html'),fileGame);
  const gameURL=pathToFileURL(resolve(root,'game.html')).href;
  harness=harness.replace('src="/host"',`src="${gameURL}"`).replace('src="/guest"',`src="${gameURL}"`).replace('src="/hold"',`src="${target}hold"`).replace("fetch('/done',{method:'POST'})",`fetch('${target}done',{method:'POST',mode:'no-cors'})`);
  await writeFile(resolve(root,'file-harness.html'),harness);
  target=pathToFileURL(resolve(root,'file-harness.html')).href;
}
let browser;
try {
  browser=spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless','--disable-gpu','--no-first-run',...(fileMode?['--allow-file-access-from-files']:[]),`--user-data-dir=${resolve(root,'profile')}`,`--screenshot=${resolve(root,'preview.png')}`,'--window-size=1440,1100','--timeout=25000','--dump-dom',target],{windowsHide:true});
  let output='',errors='';browser.stdout.on('data',chunk=>output+=chunk);browser.stderr.on('data',chunk=>errors+=chunk);
  const timer=setTimeout(()=>browser.kill(),35000);
  try{await new Promise((resolve,reject)=>{browser.on('error',reject);browser.on('exit',code=>code===0?resolve():reject(new Error('Chrome exited '+code+': '+errors.slice(-2000))));});}finally{clearTimeout(timer);}
  await writeFile(resolve(root,'result.html'),output);await writeFile(resolve(root,'chrome.log'),errors);
  assert.match(output, /data-qa="passed"/, output.match(/<p id="result">([\s\S]*?)<\/p>/)?.[1] || 'No browser result');
  console.log(`Real Chrome ${fileMode?'file://':'HTTP'} LAN test passed: pairing, synchronized play, pause, results, next round and disconnect.`);
  console.log(output.match(/CODE SIZES: ([^<]+)/)?.[1]);
} finally {browser?.kill();held?.end();await new Promise(resolve=>server.close(resolve));}
