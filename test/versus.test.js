import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Board,Match,COLS,HEIGHT,SPEED_WORDS,panel,findMatches} from '../src/engine.js';
import {VERSUS_LEVELS} from '../src/versus.js';
import {Session} from '../src/session.js';
import {PANEL_STYLES,BoardRenderer} from '../src/render.js';

const native=JSON.parse(readFileSync(new URL('./fixtures/snes-versus-levels.json',import.meta.url),'utf8'));
const empty=level=>{
  const board=new Board(42,{mode:'versus',versusLevel:level,autoRise:false});
  board.grid=Array.from({length:HEIGHT},()=>Array(COLS).fill(null));return board;
};

for(const reference of native.records)test(`two-player level ${reference.level} matches native speed, timing, colors, stop and grace`,()=>{
  const board=empty(reference.level),profile=VERSUS_LEVELS[reference.level-1];
  assert.equal(board.speedLevel,reference.speedLevel);assert.equal(board.speedWord,reference.speedWord);
  assert.equal(board.colorCount,reference.colors);assert.equal(board.graceTicks,reference.grace);
  assert.equal(board.shockQuota,reference.shockQuota);assert.equal(board.rowMode,reference.rowMode);
  assert.deepEqual(board.timing,{hover:reference.hover,flash:reference.flash*2,face:reference.face+3,pop:reference.pop+1});
  assert.equal(profile.speedLevel,reference.speedLevel);
  for(let count=3;count<=12;count++)for(const high of [false,true]){
    board.dangerFlags.fill(high);
    assert.equal(board.stopGrant({count,chain:1,shocks:0}),(high?reference.dangerCombo:reference.combo)[count-3]);
  }
  for(let chain=2;chain<=4;chain++)for(const high of [false,true]){
    board.dangerFlags.fill(high);
    assert.equal(board.stopGrant({count:3,chain,shocks:0}),(high?reference.dangerChain:reference.chain)[chain-2]);
  }
  board.dangerFlags.fill(false);
  for(let x=0;x<4;x++)board.grid[0][x]=panel(0);
  for(let y=0;y<7;y++)board.grid[y][4]=panel((6-y)%2+1);
  board.cursor={x:4,y:6};
  const moving=board.grid[6][4],pops=[];let firstFall;
  for(let frame=0;frame<=reference.measured.popsAfterMatchCalls.at(-1);frame++){
    if(frame===2)assert.equal(board.swap(),true);
    for(const event of board.step())if(event.type==='pop')pops.push(frame);
    if(board.grid[5][5]===moving&&firstFall===undefined)firstFall=frame;
    if(frame===1)assert.equal(board.stop,reference.measured.fourClearStop);
  }
  assert.equal(firstFall,reference.measured.firstFallStep);
  assert.deepEqual(pops,reference.measured.popsAfterMatchCalls);
});

test('levels 9 and 10 generate an ordinary dark blue inverted triangle, separately from shock blocks',()=>{
  for(let level=1;level<=10;level++){
    const board=empty(level),seen=new Set();
    for(let i=0;i<100;i++)for(const cell of board.makeRow())seen.add(cell.kind);
    assert.equal(seen.has(6),level>=9);assert.equal(seen.has(5),false);assert.equal(seen.size,level>=9?6:5);
    const initial=new Board(42,{mode:'versus',versusLevel:level,autoRise:false});
    assert.equal(findMatches(initial.grid).length,0);
    assert.equal(initial.grid.flat().some(cell=>cell?.kind===6),level>=9);
    board.shockCredits=1;assert.equal(board.makeRow().filter(cell=>cell.kind===5).length,1);
  }
  const board=empty(9);for(let x=0;x<3;x++)board.grid[0][x]=panel(6);
  const clear=board.step().find(event=>event.type==='clear');assert.equal(clear.count,3);assert.equal(clear.shocks,0);
  assert.equal(PANEL_STYLES[6].symbol,'down-triangle');assert.notEqual(PANEL_STYLES[6].color,PANEL_STYLES[3].color);
  const canvas=()=>({width:96,height:192,getContext:()=>new Proxy({},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}})});
  const match=new Match(42,'normal',1,{cpu:false,levels:[9,10]});
  assert.doesNotThrow(()=>new BoardRenderer(canvas(),canvas(),0).draw(match.boards[0],match,false));
});

test('versus speed progression uses the measured native interval schedule and cap',()=>{
  for(const reference of native.progression){
    const board=empty(4);board.speedLevel=reference.fromSpeed;board.speedStage=reference.fromStage-1;board.speedProgress=900;
    board.step();assert.equal(board.speedLevel,reference.toSpeed);assert.equal(board.speedWord,reference.speedWord);assert.equal(board.speedStage,reference.toStage-1);
    board.speedProgress=reference.nextInterval-1;board.step();assert.equal(board.speedLevel,reference.toSpeed);
    board.step();assert.equal(board.speedLevel,reference.toSpeed+1);
  }
  for(const reference of native.caps){
    const board=empty(10);board.speedLevel=reference.fromSpeed;board.speedWord=SPEED_WORDS[reference.fromSpeed-1];board.speedStage=49;board.speedProgress=300;
    board.step();assert.equal(board.speedLevel,reference.toSpeed);assert.equal(board.speedWord,reference.speedWord);
  }
});

test('independent player levels persist across rounds and new sets; invalid values are rejected',()=>{
  const session=new Session({mode:'local',levels:[2,9]});session.start(42);
  assert.deepEqual(session.match.boards.map(board=>board.versusLevel),[2,9]);assert.equal(session.match.cpu,null);
  for(let round=0;round<3;round++){session.match.result='win';session.continue(43+round);assert.deepEqual(session.match.boards.map(board=>board.versusLevel),[2,9]);}
  for(const levels of [[0,4],[4,11],[1.5,2],[1],null])assert.throws(()=>new Session({mode:'local',levels}),/level/);
  for(const level of [0,11,1.5])assert.throws(()=>new Board(42,{mode:'versus',versusLevel:level}),/level/);
  const safe=empty(10);safe.step();assert.equal(safe.lost,false,'Zero grace never defeats a safe board');
  for(let y=0;y<12;y++)safe.grid[y][0]=panel(y%2);safe.step();safe.step();assert.equal(safe.lost,true,'Zero-grace ceiling contact ends the round without a grace countdown');
});
