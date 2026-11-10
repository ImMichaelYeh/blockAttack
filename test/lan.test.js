import test from 'node:test';
import assert from 'node:assert/strict';
import { LanPeer, connectionCode, readConnectionCode, networkInput, networkHash } from '../src/lan.js';
import { Session } from '../src/session.js';
import { deflateSync } from 'node:zlib';

const mail = [];
class Channel {
  constructor() { this.label = 'block-attack-lan-2'; this.readyState = 'connecting'; this.bufferedAmount = 0; }
  send(data) { this.bufferedAmount += data.length; mail.push(() => { this.bufferedAmount -= data.length; if (this.remote.readyState === 'open') this.remote.onmessage?.({ data }); }); }
  close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose?.(); this.remote?.close(); }
}
class PeerConnection {
  static peers = [];
  constructor(config) { assert.deepEqual(config,{iceServers:[]}); this.id = PeerConnection.peers.push(this) - 1; this.iceGatheringState = 'complete'; this.connectionState = 'new'; }
  createDataChannel(label, options) { assert.equal(label,'block-attack-lan-2'); assert.equal(options.ordered,true); return this.channel = new Channel(); }
  async createOffer() { return { type:'offer', sdp:`v=0\r\nid=${this.id}` }; }
  async createAnswer() { return { type:'answer', sdp:`v=0\r\nid=${this.id}` }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) {
    const remote = PeerConnection.peers[Number(description.sdp.split('id=')[1])];
    if (description.type === 'offer') {
      this.channel = new Channel(); this.channel.remote = remote.channel; remote.channel.remote = this.channel;
      this.ondatachannel({channel:this.channel});
    } else {
      this.channel.readyState = remote.channel.readyState = 'open';
      this.channel.onopen(); remote.channel.onopen();
    }
  }
  close() { this.connectionState = 'closed'; this.channel?.close(); this.onconnectionstatechange?.(); }
}
function deliver(count = Infinity) { for(let i=0;mail.length&&i<count;i++)mail.shift()(); }
async function pair(t, hostOptions = {}, guestOptions = {}) {
  const original = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = PeerConnection;
  const errors=[];
  const host=new LanPeer(true,{onerror:message=>errors.push(message),...hostOptions});
  const guest=new LanPeer(false,{onerror:message=>errors.push(message),...guestOptions});
  t.after(()=>{host.close();guest.close();mail.length=0;globalThis.RTCPeerConnection=original;});
  const offer=await host.invite(),answer=await guest.answer(offer);await host.accept(answer);
  return {host,guest,errors};
}

test('LAN pairing codes reject wrong roles, old versions, malformed and oversized descriptions',async()=>{
  const offer={type:'offer',sdp:'v=0\r\nexample'};
  assert.deepEqual(await readConnectionCode(await connectionCode(offer,9),'offer'),{...offer,level:9});
  for(const code of ['oops','BA2.not-base64','x'.repeat(65537),await connectionCode({...offer,type:'answer'}),await connectionCode(offer,11), 'BA2.'+btoa(JSON.stringify({...offer,level:4,protocol:'old'}))])await assert.rejects(()=>readConnectionCode(code,'offer'),/invitation/);
  const code=await connectionCode(offer);
  await assert.rejects(()=>readConnectionCode(code,'answer'),/answer/);
});

test('compressed codes preserve complete SDP and levels, tolerate wrapped pastes and accept legacy codes',async()=>{
  const offer={type:'offer',sdp:'v=0\r\ns=-\r\na=ice-ufrag:example\r\n'+Array.from({length:12},(_,i)=>`a=candidate:${i} 1 udp 2122260223 host-${i}.local 50000 typ host generation 0 network-cost 999\r\n`).join('')};
  const legacy='BA2.'+btoa(JSON.stringify({protocol:'block-attack-lan-2',level:9,...offer}));
  const code=await connectionCode(offer,9);
  assert.match(code,/^BA2Z\.[A-Za-z0-9_-]+$/);assert.ok(code.length<legacy.length*.65,'Repeated SDP fields should compress substantially');
  const wrapped=code.match(/.{1,60}/g).join('\r\n');
  assert.deepEqual(await readConnectionCode(wrapped,'offer'),{...offer,level:9});
  assert.deepEqual(await readConnectionCode(legacy,'offer'),{...offer,level:9});
  for(const value of ['BA2Z.AAAA',code.slice(0,-3)])await assert.rejects(()=>readConnectionCode(value,'offer'),/complete/);
});

test('compressed code decoding limits expanded size and handles browsers without compression APIs',async()=>{
  const bomb='BA2Z.'+deflateSync(Buffer.from(JSON.stringify(['offer',4,'v=0'+'x'.repeat(100000)]))).toString('base64url');
  await assert.rejects(()=>readConnectionCode(bomb,'offer'),/complete/);
  const offer={type:'offer',sdp:'v=0\r\nexample'},compressed=await connectionCode(offer);
  const originalCompression=globalThis.CompressionStream,originalDecompression=globalThis.DecompressionStream;
  try{
    globalThis.CompressionStream=undefined;
    const code=await connectionCode(offer);assert.match(code,/^BA2\./);
    assert.deepEqual(await readConnectionCode(code,'offer'),{...offer,level:4});
    globalThis.DecompressionStream=undefined;
    await assert.rejects(()=>readConnectionCode(compressed,'offer'),/Update your browser/);
  }finally{globalThis.CompressionStream=originalCompression;globalThis.DecompressionStream=originalDecompression;}
});

test('LAN input accepts legal controls and rejects invalid moves and payloads',()=>{
  assert.deepEqual(networkInput({move:[0,1],swap:true,raise:false}),{move:[0,1],swap:true,raise:false,raisePressed:false});
  for(const value of [null,[],{move:[1,1]},{move:[2,0]},{move:[0,0]},{move:[0,.5]},{swap:'yes'},{raise:1},{untrusted:true}])assert.throws(()=>networkInput(value));
});

test('two peers preserve deterministic games under delayed delivery, with checksums and shared round seeds',async t=>{
  const sessions=[];
  const start=(player)=>(seed,levels)=>{sessions[player]=new Session({mode:'local',levels});sessions[player].start(seed);};
  const {host,guest,errors}=await pair(t,{level:2,onstart:start(0)},{level:9,onstart:start(1)});
  host.startRound(12345);deliver();
  assert.equal(networkHash(sessions[0].match),networkHash(sessions[1].match));
  assert.deepEqual(sessions[0].levels,[2,9]);assert.deepEqual(sessions[1].levels,[2,9]);
  const peers=[host,guest],processed=[0,0];
  for(let frame=0;Math.min(...processed)<1500&&frame<12000;frame++){
    deliver(frame%5===0?1:4);
    peers.forEach((peer,player)=>{
      if(peer.needsInput)peer.queueInput({move:frame%17===0?[player?1:-1,0]:undefined,swap:frame%23===0,raise:frame%200>140,raisePressed:frame%200===141});
      const inputs=peer.takeInput();
      if(inputs){sessions[player].match.step(...inputs);peer.verify(sessions[player].match);processed[player]++;}
    });
    assert.deepEqual(errors,[]);
  }
  deliver();
  assert.ok(Math.min(...processed)>=1500,'Network delay cannot deadlock the match');
  while(processed[0]!==processed[1]){
    const player=processed[0]<processed[1]?0:1,peer=peers[player];
    const inputs=peer.takeInput();assert.ok(inputs);sessions[player].match.step(...inputs);processed[player]++;
  }
  assert.equal(networkHash(sessions[0].match),networkHash(sessions[1].match));
  sessions.forEach(session=>{session.match.result='win';session.recordResult();});
  host.onstart=seed=>sessions[0].continue(seed);guest.onstart=seed=>sessions[1].continue(seed);
  host.startRound(67890);deliver();
  assert.equal(sessions[0].round,2);assert.equal(networkHash(sessions[0]),networkHash(sessions[1]));
  assert.equal(host.nextTick,0);assert.equal(guest.nextTick,0);
});

test('both players must release their pause; an old-round packet cannot leak into the next round',async t=>{
  const paused=[false,false];
  const {host,guest}=await pair(t,{onpause:value=>paused[0]=value},{onpause:value=>paused[1]=value});
  host.startRound(1);deliver();
  host.setPaused(true);deliver();assert.deepEqual(paused,[true,true]);
  guest.setPaused(true);deliver();host.setPaused(false);deliver();assert.deepEqual(paused,[true,true]);
  guest.setPaused(false);deliver();assert.deepEqual(paused,[false,false]);
  guest.queueInput({swap:true});host.startRound(2);deliver();
  assert.equal(host.closed,false);assert.equal(host.remoteInputs.has(3),false);
});

test('malformed packets, duplicate frames, bad checkpoints and desync close the connection',async t=>{
  const {host,guest,errors}=await pair(t);host.startRound(1);deliver();
  assert.throws(()=>host.receive(JSON.stringify({type:'input',round:1,frame:1000,input:{}})));
  assert.throws(()=>host.receive(JSON.stringify({type:'pause',round:1,value:'true'})));
  assert.throws(()=>guest.receive(JSON.stringify({type:'start',round:2,seed:1,levels:[9,9]})),/levels/);
  guest.queueInput({});deliver();
  assert.throws(()=>host.receive(JSON.stringify({type:'input',round:1,frame:3,input:{}})));
  host.nextTick=guest.nextTick=120;host.verify({value:1});guest.verify({value:2});deliver();
  assert.equal(host.closed,true);assert.equal(guest.closed,true);assert.ok(errors.some(message=>/synchronization/.test(message)));
});

test('closing either browser stops its peer, and unsupported browsers get a useful error',async t=>{
  const {host,guest,errors}=await pair(t);host.close();assert.equal(guest.closed,true);assert.ok(errors.some(message=>/left/.test(message)));
  globalThis.RTCPeerConnection=undefined;
  assert.throws(()=>new LanPeer(true),/does not support/);
});
