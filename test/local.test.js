import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, COLS, HEIGHT, panel } from '../src/engine.js';
import { Session } from '../src/session.js';
import { Controls, DEFAULT_BINDINGS, PLAYER_TWO_BINDINGS } from '../src/controls.js';
import { victoryStarOffset } from '../src/presentation.js';
import { VICTORY_STAR } from '../src/render.js';

test('both humans control their own boards without running a CPU', () => {
  const match=new Match(52,'normal',1,{cpu:false});
  match.boards.forEach(board=>{board.autoRise=false;});
  assert.equal(match.cpu,null);
  const before=match.boards.map(board=>({...board.cursor}));
  const events=match.step({move:[-1,1]},{move:[1,1],swap:true});
  assert.deepEqual(match.boards[0].cursor,{x:before[0].x-1,y:before[0].y+1});
  assert.deepEqual(match.boards[1].cursor,{x:before[1].x+1,y:before[1].y+1});
  assert.ok(events.some(event=>event.player===1&&event.type==='swap'));
  const cursors=match.boards.map(board=>({...board.cursor}));
  for(let tick=0;tick<90;tick++)match.step();
  assert.deepEqual(match.boards.map(board=>board.cursor),cursors,'No bot moves either cursor');
  match.step({raise:true},{raise:true});assert.ok(match.boards.every(board=>board.raiseHeld));
  match.boards.forEach(board=>{board.lost=true;});match.step();
  assert.equal(match.result,'draw');
});

test('human-versus-human combos send garbage in both directions', () => {
  const match=new Match(52,'normal',1,{cpu:false});
  match.boards.forEach((board,player)=>{
    board.autoRise=false;board.grid=Array.from({length:HEIGHT},()=>Array(COLS).fill(null));
    for(let column=0;column<4;column++)board.grid[0][column]=panel(player);
  });
  match.step();
  assert.deepEqual(match.attacks.map(packet=>packet.target),[1,0]);
  for(let tick=0;tick<180;tick++)match.step();
  assert.equal(match.boards[0].garbage[0].sender,1);
  assert.equal(match.boards[1].garbage[0].sender,0);
});

test('independent key maps handle simultaneous input and release cleanly', () => {
  const red=new Controls(DEFAULT_BINDINGS),blue=new Controls(PLAYER_TWO_BINDINGS,{arrows:false});
  for(const code of ['KeyW','KeyL','Enter','ShiftRight','ShiftLeft','Space'])for(const controls of [red,blue])if(controls.handles(code))controls.down(code);
  assert.deepEqual(red.sample(),{move:[0,1],swap:true,raise:true,raisePressed:true});
  assert.deepEqual(blue.sample(),{move:[1,0],swap:true,raise:true,raisePressed:true});
  assert.equal(blue.handles('ArrowUp'),false);
  for(const controls of [red,blue]){controls.clear();assert.deepEqual(controls.sample(),{move:undefined,swap:false,raise:false,raisePressed:false});}
});

test('best of three ends at two stars, awards once, and resets for a new set', () => {
  for(const results of [['win','win'],['loss','loss'],['win','loss','win'],['loss','win','loss']]) {
    const session=new Session({mode:'local'});session.start(52);
    assert.throws(()=>session.recordResult(),/Finish/);
    const expected=[0,0];
    results.forEach((result,index)=>{
      session.match.result=result;expected[result==='win'?0:1]++;
      session.recordResult();session.recordResult();
      assert.deepEqual(session.stars,expected,'Repeated finish/render must not award another star');
      assert.deepEqual(session.points,expected,'Running points award each win only once');
      assert.equal(session.complete,index===results.length-1);
      if(index<results.length-1){assert.equal(session.setWinner,null);session.continue(53);assert.equal(session.round,index+2);assert.deepEqual(session.stars,expected);}
    });
    assert.equal(session.setWinner,results.at(-1)==='win'?0:1);
    session.continue(54);
    assert.deepEqual(session.stars,[0,0]);assert.equal(session.round,1);assert.equal(session.match.result,null);assert.equal(session.match.cpu,null);
    assert.deepEqual(session.points,expected,'New sets preserve running POINT totals');
    session.match.result='draw';session.recordResult();session.continue(55);
    assert.deepEqual(session.points,expected,'Draws do not change running totals');
    session.match.result='win';session.recordResult();
    assert.deepEqual(session.points,[expected[0]+1,expected[1]]);
  }
});

test('draws replay the same round and never award or erase stars', () => {
  const session=new Session({mode:'local'});session.start(52);
  session.match.result='draw';session.recordResult();session.continue();
  assert.equal(session.round,1);assert.deepEqual(session.stars,[0,0]);
  session.match.result='win';session.recordResult();session.continue();
  session.match.result='draw';session.recordResult();session.recordResult();session.continue();
  assert.equal(session.round,2);assert.deepEqual(session.stars,[1,0]);assert.equal(session.complete,false);
});

test('the five-point victory star uses a native-size pixel grid and integer bounce', () => {
  const rows=VICTORY_STAR.split('/');
  assert.equal(rows.length,16);assert.ok(rows.every(row=>row.length===16&&/^[01]+$/.test(row)));
  assert.equal(victoryStarOffset(0,false),0);
  assert.ok(victoryStarOffset(36,false)<victoryStarOffset(72,false));
  assert.ok(victoryStarOffset(72,false)<victoryStarOffset(108,false));
  assert.equal(victoryStarOffset(150,false),0);
  for(let age=0;age<180;age++){assert.ok(Number.isInteger(victoryStarOffset(age,false)));assert.equal(victoryStarOffset(age,true),0);}
});
