import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Board,COLS,HEIGHT,panel} from '../src/engine.js';

const {records}=JSON.parse(readFileSync(new URL('./fixtures/snes-swap-hover-results.json',import.meta.url),'utf8'));
for(const fixture of records)test(`native swap/hover trace: ${fixture.name}`,()=>{
  const board=new Board(42,{autoRise:false,mode:'story',difficulty:'normal'});
  board.grid=Array.from({length:HEIGHT},()=>Array(COLS).fill(null));
  for(const [x,y,color]of fixture.cells)board.grid[14-y][x-1]=panel(color-1);
  board.cursor={x:fixture.cursor[0]-1,y:14-fixture.cursor[1]};
  let expected=[];
  for(let frame=0;frame<fixture.frames;frame++){
    for(const [at,x]of fixture.cursorChanges)if(frame===at)board.cursor.x=x;
    if(fixture.taps.includes(frame))board.swap();
    board.step();
    const change=fixture.changes.find(([at])=>at===frame);
    if(change)expected=change[1];
    const actual=board.grid.flatMap((row,y)=>row.flatMap((cell,x)=>cell&&x!==0?[[x,y]]:[]));
    assert.deepEqual(actual,expected,`frame ${frame}: swaps cannot restart hover or move a hovering block sideways`);
  }
});
