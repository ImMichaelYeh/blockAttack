import { COLS, ROWS, TIMING, isPanel } from './engine.js';
import { INTRO_TICKS, incomingPreview, comboCard, resultPose, resultCellOffset, victoryStarOffset, victoryStarSlots, boardInDanger } from './presentation.js';
import { pixelMask, pixelText, pixelWindow } from './pixels.js';
import { SERIES_LENGTHS } from './session.js';

export const TILE = 16;
export const PANEL_STYLES = Object.freeze([
  { color:'#f81010', light:'#ff9890', shade:'#980820', symbol:'heart' },
  { color:'#f8f800', light:'#ffffb0', shade:'#989008', symbol:'star' },
  { color:'#00f800', light:'#98ff90', shade:'#007028', symbol:'circle' },
  { color:'#00f8f8', light:'#a8ffff', shade:'#087098', symbol:'triangle' },
  { color:'#c018f8', light:'#f0a0ff', shade:'#681098', symbol:'diamond' },
  { color:'#c0c0c0', light:'#ffffff', shade:'#585878', symbol:'special' },
  { color:'#2838b8', light:'#8898ff', shade:'#101858', symbol:'down-triangle' },
]);
const dimColor = color => '#' + color.slice(1).match(/../g).map(channel => (parseInt(channel,16) >> 1).toString(16).padStart(2,'0')).join('');
const PREVIEW_STYLES = PANEL_STYLES.map(style => ({ ...style, color: dimColor(style.color), light: dimColor(style.light), shade: dimColor(style.shade) }));
const SYMBOL_MASKS = [
  '011000110/111101111/111111111/111111111/011111110/001111100/000111000/000010000',
  '000010000/000111000/111111111/011111110/001111100/011111110/011101110/110000011/100000001',
  '001111100/011111110/111111111/111111111/111111111/111111111/111111111/011111110/001111100',
  '000010000/000111000/000111000/001111100/001111100/011111110/011111110/111111111',
  '000010000/000111000/001111100/011111110/111111111/011111110/001111100/000111000/000010000',
  '000111000/000111000/000111000/000111000/000111000/000111000/000000000/000111000/000111000',
  '111111111/111111111/011111110/011111110/001111100/001111100/000111000/000010000',
];
// Reference pose cadence; animate our symbols inside fixed block frames.
const DANGER_FRAMES = [1,1,1,2,2,2,3,3,3,2,2,2,1,1,1,4,4,4];
const SQUASHED_SYMBOL_MASKS = SYMBOL_MASKS.map(mask=>{
  const rows=mask.split('/'),height=rows.length-2,width=rows[0].length+2;
  return Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>
    rows[Math.floor(y*rows.length/height)][Math.floor(x*rows[0].length/width)]).join('')).join('/');
});
const ACCENTS = ['#e83848','#2868d8'];
export const VICTORY_STAR = [
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000110000000',
  '0000001111000000',
  '0000001111000000',
  '0011111111111100',
  '0011111111111100',
  '0000111111110000',
  '0000111111110000',
  '0000111111110000',
  '0001111001111000',
  '0001110000111000',
  '0001100000011000',
  '0000000000000000',
  '0000000000000000',
].join('/');
const STAR_ROWS = VICTORY_STAR.split('/');
const STAR_INTERIOR = STAR_ROWS.map((row,y)=>[...row].map((bit,x)=>
  bit==='1'&&[[0,1],[0,-1],[1,0],[-1,0]].every(([dx,dy])=>STAR_ROWS[y+dy]?.[x+dx]==='1')?'1':'0').join('')).join('/');
const rect = (ctx,x,y,w,h,color) => { ctx.fillStyle=color; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); };

export function drawVictoryStar(ctx,x,y,filled=true,tick=0,reduced=false,size=16) {
  const beat=filled&&!reduced?Math.floor(tick/6)%12:0;
  const hop=[0,-1,-2,-3,-2,-1,0,-1,-2,-3,-2,-1][beat];
  const edge=value=>Math.floor(value*size/16);
  const fill=(dx,dy,w,h,color)=>{
    rect(ctx,x+edge(dx),y+edge(dy+hop),edge(dx+w)-edge(dx),edge(dy+h)-edge(dy),color);
  };
  const mask=(rows,dx,dy,color)=>{
    for(const [row,bits] of rows.split('/').entries())for(let column=0;column<bits.length;column++)if(bits[column]==='1')fill(dx+column,dy+row,1,1,color);
  };
  mask(VICTORY_STAR,0,0,filled?'#b87818':'#786020');
  if(filled) {
    mask(STAR_INTERIOR,0,0,'#ffe838');
    fill(7,4,1,2,'#fff8a0');fill(4,7,1,1,'#fff8a0');
    const eyes=!reduced&&Math.floor(tick)%180>=174?1:3;
    fill(6,7,1,eyes,'#302018');fill(9,7,1,eyes,'#302018');
  } else mask(STAR_INTERIOR,0,0,'#181038');
}

function incomingBlock(ctx,x,y,width,height,metal=false,tall=1) {
  rect(ctx,x,y,width,height,'#182848');rect(ctx,x+1,y+1,width-2,height-2,metal?'#a0a8b0':'#2868d8');
  rect(ctx,x+1,y+1,width-2,1,metal?'#f0f0f0':'#88c8ff');rect(ctx,x+1,y+2,1,height-3,metal?'#d0d8e0':'#68a8f8');
  rect(ctx,x+2,y+height-2,width-3,1,metal?'#505878':'#183878');
  if(metal) {
    for(let stripe=3;stripe<width-2;stripe+=4)rect(ctx,x+stripe,y+3,1,Math.max(1,height-6),'#606878');
  } else if(width===8) {
    rect(ctx,x+2,y+2,1,2,'#fff8e0');rect(ctx,x+5,y+2,1,2,'#fff8e0');rect(ctx,x+3,y+5,2,1,'#183878');
  } else {
    rect(ctx,x+5,y+4,3,3,'#fff8e0');rect(ctx,x+12,y+4,3,3,'#fff8e0');
    rect(ctx,x+6,y+4,1,2,'#183878');rect(ctx,x+12,y+4,1,2,'#183878');
    if(tall===1)rect(ctx,x+7,y+10,6,2,'#183878');
  }
  if(tall>1)pixelText(ctx,`X${tall}`,x+Math.floor(width/2),y+10,'#fff8e0',{small:true,center:true});
}

export function drawMascot(canvas, player, tick=0, pose='idle', reduced=false) {
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.imageSmoothingEnabled=false;
  const fill=(x,y,w,h,color)=>rect(ctx,player?24-x-w:x,y,w,h,color);
  const mask=(rows,x,y,color)=>pixelMask(ctx,player?rows.split('/').map(row=>[...row].reverse().join('')).join('/'):rows,player?24-x-rows.split('/')[0].length:x,y,color);
  const bob=reduced?0:pose==='win'?-Math.round(Math.abs(Math.sin(tick/8))*4):pose==='lose'?3:[0,-1,0,1][Math.floor(tick/16)%4];
  const dx=!reduced&&pose==='hit'?(Math.floor(tick)%4<2?-1:1):0;
  const y=8+bob, dark=player?'#183878':'#781838', light=player?'#88c8ff':'#ff98b0';
  fill(3,29,18,2,'#182838');
  fill(2+dx,y,20,20,'#282048'); fill(3+dx,y+1,18,18,ACCENTS[player]);
  fill(3+dx,y+1,18,2,light); fill(3+dx,y+3,2,14,light);
  fill(5+dx,y+17,16,2,dark); fill(19+dx,y+3,2,14,dark);
  for(const x of [6,16]) { fill(x+dx,y+5,4,5,'#fff0d0'); fill(x+2+dx,y+6,2,pose==='hit'||pose==='lose'?1:3,'#282048'); }
  fill(7+dx,y+12,10,4,'#282048');
  if(pose==='lose') fill(8+dx,y+11,8,2,'#282048');
  else for(const x of [8,11,14]) fill(x+dx,y+12,2,1,'#fff0d0');
  fill(5+dx,y+10,2,1,'#ffb8c8'); fill(18+dx,y+10,2,1,'#ffb8c8');
  if(pose==='attack'||pose==='win') { mask('010/111/010',0,4,'#f8f800'); mask('010/111/010',21,2,'#fff8a0'); }
}

function tile(ctx,cell,x,y,reduced,muted=false,preview=false,dangerFrame=1) {
  if(!cell||cell.popped) return;
  if(cell.phase==='swap') x+=cell.from*cell.timer/TIMING.swap*TILE;
  if(cell.phase==='fall') y-=(cell.fromY||0)*Math.min(1,cell.timer/TIMING.fall)*TILE;
  x=Math.round(x); y=Math.round(y);
  const style=(preview?PREVIEW_STYLES:PANEL_STYLES)[cell.kind], age=(cell.clearDuration||0)-cell.timer;
  rect(ctx,x,y,16,16,'#181820');
  const flashing=cell.phase==='clear'&&!reduced&&age%4<2;
  rect(ctx,x+1,y+1,14,14,muted?'#686878':flashing?'#fff8e0':style.color);
  rect(ctx,x+2,y+1,12,1,style.light); rect(ctx,x+1,y+2,1,11,style.light);
  rect(ctx,x+2,y+14,13,1,style.shade); rect(ctx,x+14,y+2,1,12,style.shade);
  if(cell.phase==='clear'&&age>=(cell.faceAt||35)) {
    pixelMask(ctx,'1100011/1100011/0000000/0100010/0011100',x+4,y+5,style.shade);
  } else {
    const squash=dangerFrame===4,offset=[0,0,-1,-2,3][dangerFrame],mask=(squash?SQUASHED_SYMBOL_MASKS:SYMBOL_MASKS)[cell.kind];
    pixelMask(ctx,mask,x+4-(squash?1:0),y+3+offset,style.light);
    pixelMask(ctx,mask,x+3-(squash?1:0),y+4+offset,style.shade);
  }
  if(!reduced&&cell.landing>7) rect(ctx,x+2,y+1,12,1,'#fff8c0');
  if(!reduced&&cell.phase==='convert'&&cell.timer>6) {
    rect(ctx,x+1,y+1,14,1,'#fff8c0');rect(ctx,x+1,y+1,1,14,'#fff8c0');
  }
}

function trashBody(ctx,block,x,y,w,h,panicked=false,fallbackSender=1) {
  const color=block.metal?'#a8b0c0':ACCENTS[block.sender??fallbackSender];
  rect(ctx,x,y,w,h,'#282038');rect(ctx,x+1,y+1,w-2,h-2,color);
  rect(ctx,x+2,y+1,w-4,1,block.metal?'#fff':'#ffb8c8');rect(ctx,x+1,y+2,1,h-4,'#fff0c0');
  rect(ctx,x+2,y+h-3,w-3,2,block.metal?'#505878':'#782848');
  for(let rivet=3;rivet<w-2;rivet+=8) { rect(ctx,x+rivet,y+3,1,1,'#603858');rect(ctx,x+rivet,y+h-5,1,1,'#603858'); }
  const cx=x+Math.floor(w/2),cy=y+Math.floor(h/2);
  if(block.metal) { for(let stripe=5;stripe<w-5;stripe+=5) rect(ctx,x+stripe,y+4,2,Math.max(2,h-8),'#788098'); }
  else {
    rect(ctx,cx-7,cy-4,4,4,'#fff0d0');rect(ctx,cx+3,cy-4,4,4,'#fff0d0');
    if(panicked) {
      pixelMask(ctx,'1001/0110/0110/1001',cx-7,cy-4,'#282038');pixelMask(ctx,'1001/0110/0110/1001',cx+3,cy-4,'#282038');
      rect(ctx,cx-3,cy+2,6,4,'#282038');rect(ctx,cx-1,cy+3,2,2,'#ff98b0');
    } else {
      rect(ctx,cx-5,cy-3,2,3,'#282038');rect(ctx,cx+3,cy-3,2,3,'#282038');rect(ctx,cx-5,cy+3,10,3,'#282038');
      for(let tooth=-4;tooth<5;tooth+=3)rect(ctx,cx+tooth,cy+3,2,1,'#fff0d0');
    }
  }
}

export class BoardRenderer {
  constructor(canvas,mascot,player,incoming) {
    this.canvas=canvas; this.mascot=mascot; this.player=player; this.incoming=incoming;
    canvas.width=96; canvas.height=192; mascot.width=24; mascot.height=32;
    if(incoming) { incoming.width=96; incoming.height=24; }
    this.reset();
  }
  reset() { this.pose='idle';this.poseUntil=0;this.particles=[];this.impactTick=-100;this.impactPower=0; }
  react(event,tick) {
    if(event.type==='clear') {
      this.pose='attack';this.poseUntil=tick+50;
    }
    if(event.type==='land'&&event.incoming) { this.pose='hit';this.poseUntil=tick+36;this.impactTick=tick;this.impactPower=Math.min(3,1+event.width*event.height/6); }
    if(event.type==='pop'||event.type==='convert') {
      for(let i=0;i<4;i++) this.particles.push({x:(event.x+.5)*16,y:(ROWS-event.y-.5)*16,tick,i});
      this.particles=this.particles.slice(-80);
    }
  }
  draw(board,match,reduced,{visualTick=board.tick,resultAge=0}={}) {
    const ctx=this.canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    rect(ctx,0,0,96,192,this.player?'#103848':'#183c30');
    // An original shaded forest backdrop, kept quieter than the playable panels.
    for(let tree=0;tree<5;tree++) {
      const x=tree*23-6;
      rect(ctx,x+9,0,5,192,this.player?'#184458':'#204c38');
      for(let y=14;y<192;y+=37) { rect(ctx,x,y,12,3,'#285448');rect(ctx,x+13,y+10,10,3,'#285448'); }
    }
    ctx.save();ctx.beginPath();ctx.rect(0,0,96,192);ctx.clip();
    const impactAge=board.tick-this.impactTick;
    if(!reduced&&impactAge<20) {
      const force=this.impactPower*(1-impactAge/20);
      ctx.translate(Math.round(Math.sin(impactAge*2.7)*force*.35),Math.round(Math.cos(impactAge*2.1)*force));
    }
    if(!match.result||reduced||resultAge<30) for(let x=0;x<6;x++) tile(ctx,board.nextRow[x],x*16,192-board.rise*16,reduced,false,true);
    const danger=!reduced&&!match.result&&boardInDanger(board);
    for(let y=0;y<board.grid.length;y++) {
      const row=board.grid[y].map((cell,x)=>({cell,x})).sort((a,b)=>(a.cell?.phase==='swap'?a.cell.swapOrder??a.x:a.x)-(b.cell?.phase==='swap'?b.cell.swapOrder??b.x:b.x));
      for(const {cell,x} of row) {
        if(!isPanel(cell)) continue;
        if(match.result&&resultPose(match.result,this.player)==='win'&&!reduced&&resultAge>85+y*2) continue;
        const offset=resultCellOffset(match.result,this.player,resultAge,x,reduced)/3;
        const dangerFrame=danger&&cell.phase==='idle'&&!cell.landing?DANGER_FRAMES[(board.tick+Math.floor(x/2))%DANGER_FRAMES.length]:1;
        tile(ctx,cell,x*16,(11-y-board.rise)*16+offset,reduced,!!match.result&&resultPose(match.result,this.player)!=='win',false,dangerFrame);
      }
    }
    for(const block of board.garbage) {
      if(match.result&&resultPose(match.result,this.player)==='win'&&!reduced&&resultAge>115) continue;
      const x=block.x*16,w=block.width*16,h=block.height*16;
      const offset=block.phase==='fall'?(block.fromY||0)*Math.min(1,block.timer/TIMING.fall):0;
      const y=Math.round((12-block.y-block.height-board.rise-offset)*16+resultCellOffset(match.result,this.player,resultAge,block.x,reduced)/3);
      const conversion=block.phase==='convert'?board.conversions.find(group=>group.id===block.conversion):null;
      const panicked=!!conversion&&conversion.stage!=='flash';
      trashBody(ctx,block,x,y,w,h,panicked,1-this.player);
      if(conversion&&block.retiled>0) {
        ctx.save();ctx.beginPath();
        for(let step=0;step<block.retiled;step++) {
          const column=block.width-1-step%block.width,row=1+Math.floor(step/block.width);
          ctx.rect(x+column*16,y+h-(row+1)*16,16,16);
        }
        ctx.clip();trashBody(ctx,block,x,y,w,h-16,panicked,1-this.player);ctx.restore();
      }
      if(conversion?.stage==='flash'&&!reduced&&Math.floor(conversion.age/6)%2===0)rect(ctx,x,y,w,h,'#fff8d0');
      if(block.phase==='convert') for(let column=block.width-block.revealed;column<block.width;column++) tile(ctx,block.preview[column],x+column*16,y+h-16,reduced);
    }
    if(!match.result) {
      const x=board.cursor.x*16,y=Math.round((11-board.cursor.y-board.rise)*16);
      for(const [dx,dy] of [[0,0],[27,0],[0,13],[27,13]]) {
        rect(ctx,x+dx,y+dy,5,3,'#fff8e8');rect(ctx,x+dx+(dx?3:0),y+dy-1,2,5,'#fff8e8');
      }
    }
    this.particles=this.particles.filter(p=>board.tick-p.tick<25);
    if(!reduced) for(const particle of this.particles) {
      const age=board.tick-particle.tick,angle=particle.i*Math.PI/2;
      rect(ctx,particle.x+Math.cos(angle)*age*.6,particle.y+Math.sin(angle)*age*.6+age*age*.012,1,1,'#fff8b0');
    }
    if(!reduced&&impactAge>=0&&impactAge<18) for(let spark=0;spark<8;spark++) rect(ctx,(spark*13+impactAge*(spark%2?1:-1)+96)%96,189-Math.sin(spark+impactAge/8)*impactAge,2,1,'#fff8b0');
    const card=!match.result&&comboCard(board,reduced);
    if(card) {
      rect(ctx,card.x+1,card.y+1,card.width,card.height,'#181838');
      rect(ctx,card.x,card.y,card.width,card.height,'#fff8e8');
      rect(ctx,card.x+1,card.y+1,card.width-2,card.height-2,board.banner.chain>1?'#f7a5f7':'#f8f0b8');
      pixelText(ctx,card.text,card.x+card.width/2,card.y+3,'#214a8c',{center:true,shadow:false});
    }
    ctx.restore();
    drawMascot(this.mascot,this.player,visualTick,match.result?resultPose(match.result,this.player):board.tick<this.poseUntil?this.pose:'idle',reduced);
    if(this.incoming)this.drawIncoming(match,reduced);
  }
  drawIncoming(match,reduced) {
    const ctx=this.incoming.getContext('2d'),packets=incomingPreview(match,this.player,reduced);ctx.clearRect(0,0,96,24);
    const visible=packets.length>4?packets.slice(0,3):packets;
    for(const [index,packet] of visible.entries()) {
      const x=index*24;
      if(packet.metal||packet.chain||packet.width>=6||packet.height>1) incomingBlock(ctx,x+2,2,20,16,packet.metal,packet.height);
      else {
        const columns=packet.width===4?2:Math.min(3,packet.width),rows=Math.ceil(packet.width/columns);
        const left=x+Math.floor((24-(columns*7+1))/2),top=18-(rows*7+1);
        for(let cell=0;cell<packet.width;cell++)incomingBlock(ctx,left+cell%columns*7,top+Math.floor(cell/columns)*7,8,8);
      }
    }
    if(packets.length>4)pixelText(ctx,`+${packets.length-3}`,84,12,'#fff8e0',{small:true,center:true});
  }
}

export function drawBattleEffects(canvas,match,{introAge,resultAge,visualTick,reduced}) {
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,256,224);ctx.imageSmoothingEnabled=false;
  if(!reduced)for(const packet of match.attacks) {
    const progress=(match.tick-packet.flightStart)/36;if(progress<=0||progress>=1)continue;
    const sx=(packet.sender===0?8:152)+(packet.origin.x+.5)*16,sy=24+(11-packet.origin.y-packet.origin.rise)*16;
    for(let tail=4;tail>=0;tail--) {const p=Math.max(0,progress-tail*.03);rect(ctx,sx+((packet.target===0?56:200)-sx)*p,sy+(8-sy)*p-Math.sin(p*Math.PI)*30,tail?2:3,tail?2:3,tail?ACCENTS[packet.sender]:'#fff8b0');}
  }
  if(resultAge!==null) {
    if(!reduced&&match.result!=='draw')for(let i=0;i<30;i++)rect(ctx,(i*23+visualTick*(i%2?.2:-.2)+256)%256,(i*17+resultAge*(.4+i%3*.2))%224,1,2,['#f8f800','#f7a5f7','#63d6ff'][i%3]);
    pixelWindow(ctx,38,85,180,30,true);rect(ctx,42,89,172,22,'#214a8c');
    pixelText(ctx,match.result==='draw'?'DRAW!':match.result==='win'?'RED WINS!':'BLUE WINS!',128,93,'#f8f800',{scale:2,center:true});
  }
  if(introAge<INTRO_TICKS) {
    if(!reduced&&introAge<20) {const h=Math.round((1-introAge/20)*112);rect(ctx,0,0,256,h,'#4a7be7');rect(ctx,0,224-h,256,h,'#4a7be7');rect(ctx,0,h-3,256,3,'#f7a5f7');rect(ctx,0,224-h,256,3,'#f7a5f7');}
    pixelWindow(ctx,80,90,96,29,true);rect(ctx,84,94,88,21,'#214a8c');pixelText(ctx,introAge<48?'READY?':'GO!',128,98,introAge<48?'#fff8a0':'#78f878',{scale:2,center:true});
  }
}

function battleFrame(ctx,x) {
  rect(ctx,x,20,104,200,'#382818');rect(ctx,x+1,21,102,198,'#a88038');rect(ctx,x+2,22,100,196,'#f0d078');
  rect(ctx,x+3,23,98,194,'#585038');
  for(let y=28;y<216;y+=16) {rect(ctx,x+1,y,2,3,'#68a840');rect(ctx,x+101,y+8,2,3,'#68a840');}
}

export class SceneRenderer {
  constructor(canvas) {this.canvas=canvas;canvas.width=256;canvas.height=224;this.ctx=canvas.getContext('2d');this.ctx.imageSmoothingEnabled=false;}
  drawBattle(match,buffers,{session,effects,visualTick,reduced,resultAge=0}) {
    const ctx=this.ctx;rect(ctx,0,0,256,224,'#48a8c8');
    for(let cloud=0;cloud<4;cloud++){const x=(cloud*73+(reduced?0:Math.floor(visualTick/50)))%280-24;rect(ctx,x,30+cloud%2*12,19,3,'#b8e8e0');rect(ctx,x+5,27+cloud%2*12,9,3,'#b8e8e0');}
    for(let tree=0;tree<9;tree++){const x=tree*32-8;rect(ctx,x+11,160,7,64,'#586838');rect(ctx,x,162,30,13,'#389850');rect(ctx,x+5,150,21,15,'#58b858');rect(ctx,x+10,142,11,10,'#80c868');}
    battleFrame(ctx,4);battleFrame(ctx,148);
    ctx.drawImage(buffers.boards[0],8,24);ctx.drawImage(buffers.boards[1],152,24);
    for(let player=0;player<2;player++) {
      const left=player?152:8;
      ctx.drawImage(buffers.incoming[player],left,0);
    }
    const local=session.mode==='local';
    rect(ctx,104,20,48,200,'#382818');rect(ctx,105,21,46,198,'#a88038');
    rect(ctx,106,22,44,196,'#181038');rect(ctx,106,22,44,1,'#f0d078');
    rect(ctx,149,23,1,195,'#585038');
    for(const y of [98,129,159,187])rect(ctx,108,y,40,1,'#585038');
    pixelText(ctx,session.networkPlayer===0?'YOU':'P1',116,42,'#ffb8c8',{small:true,center:true});pixelText(ctx,session.networkPlayer===1?'YOU':local?'P2':'CPU',local?140:138,42,'#b8e8ff',{small:true,center:true});
    ctx.drawImage(buffers.mascots[0],104,50);ctx.drawImage(buffers.mascots[1],128,50);
    pixelText(ctx,'VS',128,84,'#f0d078',{center:true});
    pixelText(ctx,local?'POINT':'STAGE',128,104,'#f0d078',{center:true});
    if(local) for(let player=0;player<2;player++) pixelText(ctx,session.points?.[player]??0,118+player*20,115,player?'#b8e8ff':'#ffb8c8',{small:true,scale:(session.points?.[player]??0)<100?2:1,center:true});
    else pixelText(ctx,session.mode==='series'?session.level:1,128,115,'#fff0c0',{small:true,scale:2,center:true});
    pixelText(ctx,'LEVEL',128,134,'#f0d078',{center:true});
    if(local) for(let player=0;player<2;player++) pixelText(ctx,match.boards[player].versusLevel??({easy:3,normal:5,hard:7}[match.boards[player].difficulty]),118+player*20,145,player?'#b8e8ff':'#ffb8c8',{small:true,scale:2,center:true});
    else pixelText(ctx,session.cpuLevel??session.level,128,145,'#fff0c0',{small:true,scale:2,center:true});
    pixelText(ctx,'TIME',128,164,'#f0d078',{center:true});
    const seconds=Math.floor(match.tick/60),time=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    pixelText(ctx,time,128,174,'#fff0c0',{small:true,scale:2,center:true});
    for(const star of victoryStarSlots(session,match.result)) {
      drawVictoryStar(ctx,star.x,star.y+(star.awarded?Math.round(victoryStarOffset(resultAge,reduced)/6):0),star.filled,visualTick+star.player*37+star.slot*17,reduced,16);
    }
    ctx.drawImage(effects,0,0);
  }
  drawMenu({setup,multiplayer=false,redLevel=4,blueLevel=4,error='',index,mode,difficulty,level=1,mascots,focus}) {
    const ctx=this.ctx;rect(ctx,0,0,256,224,'#6363d6');
    for(let y=0;y<224;y+=24)for(let x=0;x<256;x+=24){pixelMask(ctx,'00100/01010/10001/01010/00100',x+5,y+5,'#7373de');pixelMask(ctx,'11/11',x+18,y+17,'#5353bc');}
    pixelWindow(ctx,18,16,100,24,true);rect(ctx,22,20,92,16,'#214a8c');pixelText(ctx,'SELECT',68,21,'#fff',{scale:2,center:true});
    pixelText(ctx,'BLOCK',199,16,'#f8f800',{center:true});pixelText(ctx,'ATTACK!',199,26,'#f7a5f7',{center:true});
    if(multiplayer) {
      pixelWindow(ctx,26,49,204,153);
      pixelText(ctx,'2 PLAYER GAME',128,58,'#214a8c',{center:true,shadow:false});
      pixelText(ctx,'LOCAL LEVELS',128,74,'#703878',{small:true,center:true,shadow:false});
      for(const [id,label,value,y]of [['local-red-level','RED',redLevel,88],['local-blue-level','BLUE',blueLevel,112]]) {
        pixelText(ctx,label,42,y+6,label==='RED'?'#a83058':'#214a8c',{shadow:false});
        for(const [suffix,text,x,width]of [['-down','-',118,24],['',String(value),144,36],['-up','+',182,24]]) {
          pixelWindow(ctx,x,y,width,20,focus===id+suffix);pixelText(ctx,text,x+width/2,y+6,'#214a8c',{center:true,shadow:false});
        }
      }
      for(const [id,label,y]of [['multiplayer-local','START LOCAL',138],['multiplayer-lan','LAN GAME',158],['multiplayer-close','< BACK',180]]) {
        rect(ctx,42,y,172,14,focus===id?'#703878':'#214a8c');rect(ctx,43,y+1,170,1,'#63d6ff');pixelText(ctx,label,128,y+4,'#fff',{center:true});
      }
      if(error)pixelText(ctx,error.slice(0,54),128,209,'#fff',{small:true,center:true});
    } else if(!setup) {
      pixelWindow(ctx,34,55,126,102);
      const entries=['1 PLAYER GAME','2 PLAYER GAME','HOW TO PLAY','SETTINGS'];
      entries.forEach((text,row)=>{const y=65+row*22;if(row===index){rect(ctx,40,y-3,113,15,'#f8e8f8');pixelMask(ctx,'1000/1100/1110/1111/1110/1100/1000',42,y,'#a83088');}pixelText(ctx,text,51,y,['#214a8c','#a83058','#887810','#188848'][row],{shadow:false});});
      pixelWindow(ctx,170,52,80,35,true);pixelText(ctx,['READY TO','LOCAL / LAN','MAKE SOME','YOUR KEYS'][index],210,60,'#a01878',{small:true,center:true,shadow:false});pixelText(ctx,['MAKE A CHAIN?','FIRST TO 2!','BIG COMEBACKS!','YOUR SOUND!'][index],210,72,'#a01878',{small:true,center:true,shadow:false});
      ctx.drawImage(mascots[0],170,121,48,64);ctx.drawImage(mascots[1],222,158);
    } else {
      pixelWindow(ctx,26,49,204,145);
      pixelText(ctx,'1 PLAYER GAME',128,58,'#214a8c',{center:true,shadow:false});
      for(const [row,label,value] of [[0,'SINGLE MATCH','single'],[1,'CPU SERIES','series']]) {
        const y=77+row*16;rect(ctx,42,y,7,7,'#214a8c');rect(ctx,43,y+1,5,5,'#fff');if(mode===value)rect(ctx,44,y+2,3,3,'#a83088');pixelText(ctx,label,55,y,'#202048',{shadow:false});if(focus===`mode-${value}`)pixelText(ctx,'>',33,y,'#a83088',{shadow:false});
      }
      if(mode==='series') {
        pixelText(ctx,'DIFFICULTY',42,108,'#202048',{small:true,shadow:false});
        ['easy','normal','hard'].forEach((value,index)=>{
          const x=42+index*58,selected=value===difficulty;
          rect(ctx,x,119,56,16,focus===`difficulty-${value}`?'#703878':selected?'#a83088':'#214a8c');
          pixelText(ctx,value,x+28,124,'#fff',{small:true,center:true});
        });
        pixelText(ctx,`${SERIES_LENGTHS[difficulty]} LEVELS`,128,139,'#214a8c',{small:true,center:true,shadow:false});
      } else {
        pixelText(ctx,'LEVEL',42,114,'#202048',{small:true,shadow:false});
        for(const [id,label,x,width] of [['level-down','-',108,24],['level',String(level),134,50],['level-up','+',186,24]]) {
          pixelWindow(ctx,x,108,width,20,focus===id);pixelText(ctx,label,x+width/2,114,'#214a8c',{center:true,shadow:false});
        }
      }
      for(const [id,label,y] of [['play-button','START GAME',152],['setup-back','< BACK',174]]) {
        rect(ctx,42,y,172,13,focus===id?'#703878':'#214a8c');rect(ctx,43,y+1,170,1,'#63d6ff');pixelText(ctx,label,128,y+3,'#fff',{center:true});
      }
      pixelText(ctx,'TAB SELECT  ENTER PLAY  ESC BACK',128,205,'#fff',{small:true,center:true});
    }
  }
  drawDialog({kicker,title,copy,action,focus}) {
    const ctx=this.ctx;pixelWindow(ctx,8,25,240,149,true);
    pixelText(ctx,kicker,128,33,'#703878',{center:true,shadow:false});
    for(const [text,y,scale,limit,color]of [[title,45,2,17,'#214a8c'],[copy,87,1,34,'#202048']]) {
      let line='',row=0;
      for(const word of [...text.toUpperCase().split(' '),'']) {
        if(line&&((line+' '+word).length>limit||!word)) {
          pixelText(ctx,line,128,y+row*(scale===2?18:10),color,{scale,center:true,shadow:false});
          line='';row++;
        }
        line+=(line?' ':'')+word;
      }
    }
    for(const [id,label,y]of[['continue',action,128],['overlay-menu','MAIN MENU',149]]){rect(ctx,32,y,192,14,focus===id?'#703878':'#214a8c');rect(ctx,33,y+1,190,1,'#63d6ff');pixelText(ctx,label,128,y+4,'#fff',{center:true});}
  }
  drawHelp({move,swap,raise,focus}) {
    const ctx=this.ctx;pixelWindow(ctx,8,8,240,208,true);
    pixelText(ctx,'HOW TO PLAY',128,19,'#214a8c',{center:true,shadow:false});pixelText(ctx,'X',231,17,focus==='help-close'?'#a01878':'#214a8c',{shadow:false});
    const lessons=[
      ['1. SWAP TWO NEIGHBORS',['Match three colors in a row or column.','An empty space can be swapped, too.']],
      ['2. BUILD A BIGGER CLEAR',['Clear four or more to send trash.','Falling matches make powerful chains!']],
      ['3. TURN TRASH INTO BLOCKS',['Match beside trash to break it down.','Gray ! blocks send metal trash.']],
      ['4. KEEP YOUR STACK LOW',['The stack rises. Top out and you lose!','Raise it yourself for fresh blocks.']],
    ];
    lessons.forEach(([title,lines],index)=>{const y=40+index*34;pixelText(ctx,title,20,y,'#703878',{shadow:false});lines.forEach((line,row)=>pixelText(ctx,line,20,y+12+row*7,'#202048',{small:true,shadow:false}));});
    pixelText(ctx,`${move} MOVE  ${swap} SWAP`,128,181,'#214a8c',{small:true,center:true,shadow:false});pixelText(ctx,`${raise} RAISE  ESC PAUSE`,128,190,'#214a8c',{small:true,center:true,shadow:false});
    rect(ctx,24,199,208,12,focus==='help-done'?'#703878':'#214a8c');pixelText(ctx,'GOT IT!',128,202,'#fff',{center:true});
  }
}
