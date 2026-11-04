import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, Board, COLS, HEIGHT, panel } from '../src/engine.js';
import { incomingPackets, incomingPreview, comboCard, resultPose, resultCellOffset, RESULT_TICKS, sceneScale, victoryStarSlots } from '../src/presentation.js';
import { BoardRenderer, SceneRenderer, drawBattleEffects, drawVictoryStar, drawMascot, PANEL_STYLES } from '../src/render.js';

function canvas(width = 576, height = 1152) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => target[key] ?? ((...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `Invalid ${key} coordinate`);
      calls.push({ method: key, args, color: target.fillStyle });
    }),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return { width, height, calls, getContext: () => ctx };
}

test('panel identities follow the reference color/symbol mapping with newly drawn shapes', () => {
  assert.deepEqual(PANEL_STYLES.map(panel => panel.symbol), ['heart', 'star', 'circle', 'triangle', 'diamond', 'special']);
  assert.equal(PANEL_STYLES[0].color, '#f81010');
  assert.equal(PANEL_STYLES[1].color, '#f8f800');
});

test('reversing an unfinished swap preserves the previous renderer paint order', () => {
  const match=new Match(12),board=new Board(12,{autoRise:false}),surface=canvas();
  board.grid=Array.from({length:HEIGHT},()=>Array(COLS).fill(null));board.cursor={x:0,y:0};
  board.grid[0][0]=panel(0);board.grid[0][1]=panel(1);match.boards[0]=board;
  board.swap();board.step();assert.ok(board.swap());
  new BoardRenderer(surface,canvas(24,32),0).draw(board,match,false);
  const colors=surface.calls.filter(call=>call.method==='fillRect'&&call.args[1]<192&&call.args[2]===14&&call.args[3]===14).map(call=>call.color);
  assert.deepEqual(colors,[PANEL_STYLES[1].color,PANEL_STYLES[0].color]);
});

test('one 256x224 bitmap composes native boards and HUD using integer pixels', () => {
  const screen=canvas(), scene=new SceneRenderer(screen), match=new Match(5);
  const boards=[canvas(),canvas()], mascots=[canvas(),canvas()], incoming=[canvas(),canvas()];
  for(let player=0;player<2;player++) new BoardRenderer(boards[player],mascots[player],player,incoming[player]).draw(match.boards[player],match,false);
  assert.deepEqual([screen.width,screen.height],[256,224]);
  assert.deepEqual(boards.map(board=>[board.width,board.height]),[[96,192],[96,192]]);
  scene.drawBattle(match,{boards,mascots,incoming},{session:{mode:'single',level:1,difficulty:'normal'},effects:canvas(256,224),visualTick:12,reduced:false});
  assert.ok(screen.calls.some(call=>call.color==='#505868'),'CPU play displays its unearned star slots');
  const placements=screen.calls.filter(call=>call.method==='drawImage'&&boards.includes(call.args[0])).map(call=>call.args.slice(1));
  assert.deepEqual(placements,[[8,24],[152,24]]);
  const stars=[1,0];match.result='win';
  scene.drawBattle(match,{boards,mascots,incoming},{session:{mode:'local',round:2,stars,difficulty:'normal'},effects:canvas(256,224),visualTick:36,resultAge:36,reduced:false});
  assert.deepEqual(stars,[1,0],'Rendering never awards another star');
  for(const setup of [false,true]) scene.drawMenu({setup,index:0,mode:'series',difficulty:'hard',length:10,mascots,focus:'play-button'});
  scene.drawDialog({kicker:'Round complete',title:'Red wins!',copy:'Ready for the next round?',action:'Next level',focus:'continue'});
  scene.drawHelp({move:'WASD',swap:'Enter',raise:'Left Shift',focus:'help-done'});
  scene.drawSettings({sound:true,volume:.4,reduced:false,rows:[{action:'raise',label:'Raise',key:'Left Shift'}],capture:null,message:'Saved',focus:'settings-done'});
  for(const call of [...screen.calls,...boards.flatMap(board=>board.calls)]) {
    assert.ok(!['fillText','strokeText','bezierCurveTo','arc','scale'].includes(call.method), `${call.method} must not introduce another rasterization grid`);
    for(const value of call.args) if(typeof value==='number') assert.ok(Number.isInteger(value),`${call.method} uses fractional pixels`);
  }
});

test('the unplayable rising preview uses a darker palette than playable panels', () => {
  const match=new Match(12),board=match.boards[0],surface=canvas();
  board.grid=Array.from({length:HEIGHT},()=>Array(COLS).fill(null));board.grid[0][0]=panel(0);
  board.nextRow=Array.from({length:COLS},()=>panel(0));board.rise=.75;
  new BoardRenderer(surface,canvas(24,32),0).draw(board,match,false);
  const baseAt=y=>surface.calls.find(call=>call.method==='fillRect'&&call.args[0]===1&&call.args[1]===y&&call.args[2]===14&&call.args[3]===14)?.color;
  assert.equal(baseAt(165),'#f81010');
  assert.equal(baseAt(181),'#7c0808');
  assert.ok(surface.calls.some(call=>call.color==='#7f4c48'),'Highlights in the preview are dimmed too');
  board.cursor={x:0,y:0};assert.equal(board.move(0,-1),false);
});

test('Red looks right and Blue is mirrored to look left', () => {
  for(const player of [0,1]) {
    const surface=canvas(24,32);drawMascot(surface,player,0);
    const pupils=surface.calls.filter(call=>call.color==='#282048'&&call.args[2]===2&&call.args[3]===3).sort((a,b)=>a.args[0]-b.args[0]);
    const eyes=surface.calls.filter(call=>call.color==='#fff0d0'&&call.args[2]===4&&call.args[3]===5).sort((a,b)=>a.args[0]-b.args[0]);
    assert.equal(pupils.length,2);
    pupils.forEach((pupil,index)=>assert.equal(pupil.args[0],eyes[index].args[0]+(player?0:2)));
    if(player)assert.ok(surface.calls.some(call=>call.color==='#88c8ff'&&call.args[0]===19&&call.args[2]===2&&call.args[3]===14));
  }
});

test('win stars use a 1x2 CPU grid and a 2x2 local grid with player columns', () => {
  const cpu={mode:'single'};
  assert.deepEqual(victoryStarSlots(cpu,null).map(({x,y,filled})=>[x,y,filled]),[[112,207,false],[136,207,false]]);
  assert.deepEqual(victoryStarSlots(cpu,'loss').map(star=>star.filled),[false,true]);
  assert.equal(victoryStarSlots({mode:'series'},'win').length,2);
  const local={mode:'local',stars:[2,1]},before=JSON.stringify(local);
  const slots=victoryStarSlots(local,'win');
  assert.deepEqual(slots.map(({x,y})=>[x,y]),[[112,189],[136,189],[112,213],[136,213]]);
  assert.deepEqual(slots.map(star=>star.filled),[true,true,true,false]);
  assert.deepEqual(slots.filter(star=>star.awarded).map(star=>[star.player,star.slot]),[[0,1]]);
  assert.equal(JSON.stringify(local),before);
});

test('trash flashes, reacts, reveals panels and redraws its remaining layer without changing physics', () => {
  const match=new Match(12),board=match.boards[0],surface=canvas();board.autoRise=false;
  assert.ok(board.addGarbage({width:3,height:2,sender:1}));
  const block=board.garbage[0],renderer=new BoardRenderer(surface,canvas(24,32),0);
  for(let step=0;step<100&&block.phase!=='idle';step++)board.step();
  assert.equal(block.phase,'idle');
  board.activateGarbage([{x:block.x,y:block.y-1}],1,50);
  const group=board.conversions[0];
  const advance=()=>{for(const event of board.step())renderer.react(event,board.tick);};
  const draw=(reduced=false)=>{
    surface.calls.length=0;const before=JSON.stringify(board);renderer.draw(board,match,reduced);
    assert.equal(JSON.stringify(board),before);return surface.calls;
  };
  const isFlash=call=>call.color==='#fff8d0'&&call.args[2]===block.width*16&&call.args[3]===block.height*16;
  assert.ok(draw().some(isFlash));
  assert.ok(!draw(true).some(isFlash));
  for(let step=0;step<6;step++)advance();
  assert.ok(!draw().some(isFlash));
  while(group.stage==='flash')advance();
  assert.ok(draw().some(call=>call.color==='#ff98b0'),'The converting block has a panicked face');
  while(!block.revealed)advance();
  assert.ok(renderer.particles.length>=4,'Each conversion step emits sparkles');
  assert.ok(draw().some(call=>call.color==='#fff8c0'),'Newly revealed panels shine');
  while(!block.retiled)advance();
  const calls=draw();
  assert.ok(calls.filter(call=>call.method==='clip').length>=2,'Only visited upper cells are redrawn');
  assert.ok(calls.some(call=>call.color==='#2868d8'&&call.args[2]===46&&call.args[3]===14));
  while(board.conversions.length)advance();
  assert.equal(block.height,1);assert.equal(block.phase,'idle');
  assert.ok(!draw().some(call=>call.color==='#ff98b0'),'The remaining trash returns to its normal face');
});

test('combo cards follow their clears, float locally, and stay inside the board', () => {
  const match=new Match(12),board=match.boards[0],surface=canvas();
  board.autoRise=false;board.grid=Array.from({length:HEIGHT},()=>Array(COLS).fill(null));
  for(let x=0;x<4;x++)board.grid[0][x]=panel(0);
  board.step();
  const before=JSON.stringify(board),card=comboCard(board);
  assert.equal(card.text,'4');assert.ok(card.y>150,'A bottom-row combo cannot appear at the top');
  new BoardRenderer(surface,canvas(24,32),0).draw(board,match,false);
  assert.ok(surface.calls.some(call=>call.color==='#f8f0b8'&&call.args[0]===card.x+1&&call.args[1]===card.y+1));
  assert.equal(JSON.stringify(board),before);
  board.banner.life=20;
  assert.ok(comboCard(board).y<card.y);
  assert.equal(comboCard(board,true).y,card.y,'Reduced effects holds the card beside the match');
  for(const x of [0,5])for(const y of [0,10]) {
    Object.assign(board.banner,{x,y,chain:12});board.rise=.8;
    const bounds=comboCard(board);
    assert.equal(bounds.text,'X12');
    assert.ok(bounds.x>=0&&bounds.x+bounds.width+1<96);
    assert.ok(bounds.y>=0&&bounds.y+bounds.height+1<192);
  }
  board.banner.life=0;assert.equal(comboCard(board),null);
});

test('incoming previews appear after flight and leave the strip when admitted', () => {
  const match=new Match(12),packet={target:0,width:3,height:1,flightStart:15};
  match.attacks=[packet,{...packet,target:1}];match.tick=50;
  assert.deepEqual(incomingPreview(match,0),[]);
  assert.deepEqual(incomingPreview(match,0,true),[packet]);
  match.tick=51;assert.deepEqual(incomingPreview(match,0),[packet]);
  match.attacks.shift();match.boards[0].garbage=[{incoming:true,phase:'fall',width:3,height:1}];
  assert.deepEqual(incomingPreview(match,0),[],'The real falling block replaces its queued icon');
});

test('incoming glyphs show small groups, tall/wide blocks, metal, and queue overflow', () => {
  for(const [packets,small,large] of [
    [[{width:3,height:1}],3,0],[[{width:4,height:1}],4,0],[[{width:5,height:1}],5,0],
    [[{width:6,height:1}],0,1],[[{width:6,height:3,chain:true}],0,1],[[{width:6,height:1,metal:true}],0,1],
    [Array.from({length:6},()=>({width:3,height:1})),9,0],
  ]) {
    const match=new Match(12),strip=canvas(96,24);
    match.tick=100;match.attacks=packets.map(packet=>({...packet,target:0,flightStart:0}));
    new BoardRenderer(canvas(),canvas(24,32),0,strip).drawIncoming(match,false);
    const outlines=strip.calls.filter(call=>call.method==='fillRect'&&call.color==='#182848');
    assert.equal(outlines.filter(call=>call.args[2]===8).length,small);
    assert.equal(outlines.filter(call=>call.args[2]===20).length,large);
    for(const call of strip.calls.filter(call=>call.method==='fillRect')) {
      const [x,y,w,h]=call.args;assert.ok(x>=0&&y>=0&&x+w<=96&&y+h<=24);
    }
    if(packets[0].metal)assert.ok(strip.calls.some(call=>call.color==='#a0a8b0'));
    if(packets.length>4)assert.ok(strip.calls.some(call=>call.method==='fillRect'&&call.args[0]>78));
  }
});

test('earned stars have smiling faces; blinking stops with reduced effects', () => {
  for(const [tick,reduced,height]of [[0,false,2],[174,false,1],[174,true,2]]) {
    const surface=canvas();drawVictoryStar(surface.getContext('2d'),0,0,true,tick,reduced);
    const eyes=surface.calls.filter(call=>call.color==='#383050');
    assert.equal(eyes.length,2);assert.ok(eyes.every(call=>call.args[3]===height));
    assert.ok(surface.calls.some(call=>call.color==='#983858'));
    assert.equal(surface.calls.filter(call=>call.color==='#ff9890').length,2);
  }
  const empty=canvas();drawVictoryStar(empty.getContext('2d'),0,0,false);
  assert.ok(!empty.calls.some(call=>call.color==='#383050'),'Empty score slots have no face yet');
});

test('the complete scene scales in whole-number steps and retains 8:7 geometry', () => {
  assert.equal(sceneScale(1083,984),3);
  for(const [width,height] of [[320,600],[640,700],[1280,1080],[1920,1080]]) {
    const scale=sceneScale(width,height);
    assert.ok(Number.isInteger(scale)&&scale>=1);
    assert.ok(256*scale<=width-40);
    assert.ok(224*scale<=height-124);
    assert.equal(256*scale/(224*scale),8/7);
  }
});

test('falling garbage and conversion previews render without changing their state', () => {
  const match = new Match(2), board = match.boards[0];
  assert.ok(board.addGarbage({ width: 3, height: 2, sender: 1 }));
  const renderer = new BoardRenderer(canvas(), canvas(160, 160), 0, canvas(576, 80));
  const block = board.garbage[0];
  board.activateGarbage([{ x: block.x, y: block.y - 1 }], 1, 50);
  assert.equal(block.phase, 'convert');
  for (let tick = 0; tick < 140; tick++) {
    board.step();
    if (tick % 5) continue;
    const before = JSON.stringify(board);
    renderer.draw(board, match, false);
    assert.equal(JSON.stringify(board), before);
  }
});

test('incoming trash includes queued, overdue and falling packets until they land', () => {
  const match = new Match(2);
  const queued = { target: 0, due: -10, width: 4, height: 1 };
  const foreign = { target: 1, due: 10, width: 6, height: 2 };
  const falling = { incoming: true, phase: 'fall', width: 3, height: 1 };
  const landed = { incoming: false, phase: 'idle', width: 6, height: 1 };
  match.attacks = [queued, foreign]; match.boards[0].garbage = [falling, landed];
  assert.deepEqual(incomingPackets(match, 0), [queued, falling]);
  falling.incoming = false;
  assert.deepEqual(incomingPackets(match, 0), [queued]);
  assert.deepEqual(incomingPackets(match, 1), [foreign]);
});

test('result cascades and poses distinguish both players and respect reduced effects', () => {
  assert.equal(resultPose('win', 0), 'win'); assert.equal(resultPose('win', 1), 'lose');
  assert.equal(resultPose('loss', 0), 'lose'); assert.equal(resultPose('loss', 1), 'win');
  assert.equal(resultPose('draw', 0), 'hit');
  assert.equal(resultCellOffset('loss', 0, 20, 0, false), 0);
  assert.ok(resultCellOffset('loss', 0, 45, 0, false) > resultCellOffset('loss', 0, 45, 5, false));
  assert.equal(resultCellOffset('win', 0, RESULT_TICKS, 0, false), 0);
  assert.equal(resultCellOffset('loss', 0, RESULT_TICKS, 0, true), 0);
});

test('rendering impacts, projectiles, intros and results never mutates the simulation', () => {
  const match = new Match(12), board = canvas(), mascot = canvas(160, 160), incoming = canvas(576, 80), overlay = canvas(1536, 1344);
  match.attacks.push({ target: 1, sender: 0, width: 4, height: 1, flightStart: -18, origin: { x: 2, y: 3, rise: 0 } });
  const renderer = new BoardRenderer(board, mascot, 0, incoming);
  renderer.react({ type: 'land', incoming: true, width: 6, height: 2 }, match.tick);
  const before = JSON.stringify(match);
  renderer.draw(match.boards[0], match, false, { visualTick: 30 });
  assert.equal(renderer.pose, 'hit'); assert.ok(renderer.impactPower > 0);
  assert.ok(board.calls.some(call => call.method === 'translate' && call.args.some(value => value !== 0)));
  for (const introAge of [0, 25, 55, 72]) drawBattleEffects(overlay, match, { introAge, resultAge: null, visualTick: 30, reduced: false });
  assert.equal(JSON.stringify(match), before);
  for (const result of ['win', 'loss', 'draw']) for (const reduced of [false, true]) {
    match.result = result;
    const snapshot = JSON.stringify(match);
    for (const age of [0, 50, 100, 150]) {
      renderer.draw(match.boards[0], match, reduced, { visualTick: age, resultAge: age });
      drawBattleEffects(overlay, match, { introAge: 72, resultAge: age, visualTick: age, reduced });
    }
    assert.equal(JSON.stringify(match), snapshot);
  }
});
