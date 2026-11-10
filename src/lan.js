// Bump this when simulation or input semantics become incompatible.
const LAN_PROTOCOL = 'block-attack-lan-2';
const LAN_DELAY = 3;

export async function connectionCode(description, level = 4) {
  const legacy = 'BA2.' + btoa(JSON.stringify({ protocol: LAN_PROTOCOL, level, type: description.type, sdp: description.sdp }));
  if (typeof CompressionStream === 'undefined') return legacy;
  try {
    const payload = JSON.stringify([description.type, level, description.sdp]);
    const compressed = new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate'));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    const code = 'BA2Z.' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    return code.length < legacy.length ? code : legacy;
  } catch { return legacy; }
}

export async function readConnectionCode(value, type) {
  let unsupported = false;
  try {
    if (typeof value !== 'string' || value.length > 65536) throw new Error();
    const code = value.replace(/\s/g,'');
    let data;
    if (code.startsWith('BA2Z.')) {
      if (typeof DecompressionStream === 'undefined') { unsupported = true; throw new Error(); }
      const bytes = Uint8Array.from(atob(code.slice(5).replaceAll('-','+').replaceAll('_','/')), character => character.charCodeAt(0));
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
      const chunks = []; let length = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 65536) { await reader.cancel(); throw new Error(); }
        chunks.push(chunk.value);
      }
      const decoded = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { decoded.set(chunk, offset); offset += chunk.length; }
      const fields = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
      if (!Array.isArray(fields) || fields.length !== 3) throw new Error();
      data = { protocol: LAN_PROTOCOL, type: fields[0], level: fields[1], sdp: fields[2] };
    } else {
      if (!code.startsWith('BA2.')) throw new Error();
      data = JSON.parse(atob(code.slice(4)));
    }
    if (data.protocol !== LAN_PROTOCOL || !Number.isInteger(data.level) || data.level < 1 || data.level > 10 || data.type !== type || typeof data.sdp !== 'string' || !data.sdp.startsWith('v=0')) throw new Error();
    return { type: data.type, sdp: data.sdp, level: data.level };
  } catch { throw new Error(unsupported ? 'Update your browser to read compressed connection codes.' : `Paste a complete Block Attack ${type === 'offer' ? 'invitation' : 'answer'} code.`); }
}

export function networkInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['move','swap','raise','raisePressed'].includes(key))) throw new Error('Invalid player input.');
  const input = {};
  for (const key of ['swap','raise','raisePressed']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error('Invalid player input.');
    input[key] = value[key] === true;
  }
  if (value.move !== undefined) {
    if (!Array.isArray(value.move) || value.move.length !== 2 || !value.move.every(Number.isInteger) || Math.abs(value.move[0]) + Math.abs(value.move[1]) !== 1) throw new Error('Invalid cursor movement.');
    input.move = [...value.move];
  }
  return input;
}

export function networkHash(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export class LanPeer {
  constructor(host, { level = 4, onready = () => {}, onstart = () => {}, onpause = () => {}, onerror = () => {} } = {}) {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('This browser does not support LAN play. Try current Chrome, Edge or Firefox.');
    if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('Choose a player level from 1 to 10.');
    this.level = level; this.remoteLevel = null;
    this.host = host; this.onready = onready; this.onstart = onstart; this.onpause = onpause; this.onerror = onerror;
    this.closed = false; this.round = 0; this.localPaused = false; this.remotePaused = false;
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.ondatachannel = event => {
      if (this.host || this.channel || event.channel.label !== LAN_PROTOCOL) { this.fail('Unexpected game connection.'); return; }
      this.attach(event.channel);
    };
    this.pc.onconnectionstatechange = () => {
      if (['failed','closed'].includes(this.pc.connectionState)) this.fail('LAN connection ended. Both players must reconnect.');
    };
    if (host) this.attach(this.pc.createDataChannel(LAN_PROTOCOL, { ordered: true }));
  }

  attach(channel) {
    this.channel = channel;
    channel.onopen = () => {
      if (this.closed) return;
      clearTimeout(this.connectTimeout);
      this.lastMessage = Date.now();
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastMessage > 10000) this.fail('The other player stopped responding. Reconnect to play again.');
        else this.send({ type: 'ping' });
      }, 1000);
      this.heartbeat.unref?.();
      this.onready();
    };
    channel.onmessage = event => {
      try { this.receive(event.data); }
      catch { this.fail('LAN data did not match this game version. Reconnect using the same version.'); }
    };
    channel.onclose = () => this.fail('The other player left the LAN game.');
    channel.onerror = () => this.fail('LAN connection failed. Check that both devices are on the same network.');
  }

  async description() {
    if (this.pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.pc.removeEventListener('icegatheringstatechange', changed); this.cancelGather = null; };
      const changed = () => { if (this.pc.iceGatheringState === 'complete') { cleanup(); resolve(); } };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Could not create a LAN code. Check your network and try again.')); }, 15000);
      this.cancelGather = () => { cleanup(); reject(new Error('Connection cancelled.')); };
      this.pc.addEventListener('icegatheringstatechange', changed);
      changed();
    });
    if (this.closed) throw new Error('Connection cancelled.');
    return connectionCode(this.pc.localDescription, this.level);
  }

  async invite() {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return this.description();
  }

  async answer(code) {
    const description = await readConnectionCode(code, 'offer'); this.remoteLevel = description.level;
    await this.pc.setRemoteDescription(description);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return this.description();
  }

  async accept(code) {
    const description = await readConnectionCode(code, 'answer'); this.remoteLevel = description.level;
    await this.pc.setRemoteDescription(description);
    if (!this.closed && this.channel.readyState !== 'open') this.connectTimeout = setTimeout(() => this.fail('Could not reach the other browser. Check the network, then create new connection codes.'), 20000);
  }

  send(message) {
    if (this.closed || this.channel?.readyState !== 'open') return false;
    if (this.channel.bufferedAmount > 65536) { this.fail('LAN connection is too slow. Reconnect to play again.'); return false; }
    try { this.channel.send(JSON.stringify(message)); return true; }
    catch { this.fail('Could not send to the other player.'); return false; }
  }

  begin(round, seed, levels) {
    this.round = round; this.nextTick = 0; this.nextSend = LAN_DELAY; this.nextRemote = LAN_DELAY;
    this.localInputs = new Map(); this.remoteInputs = new Map(); this.hashes = new Map(); this.remoteHashes = new Map();
    for (let tick = 0; tick < LAN_DELAY; tick++) { this.localInputs.set(tick, {}); this.remoteInputs.set(tick, {}); }
    this.localPaused = this.remotePaused = false;
    this.onstart(seed, levels);
  }

  startRound(seed) {
    if (!this.host || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Only the host can start a round.');
    const round = this.round + 1;
    const levels = [this.level, this.remoteLevel];
    if (levels.some(level => !Number.isInteger(level) || level < 1 || level > 10)) throw new Error('Both players must choose a level.');
    if (this.send({ type: 'start', round, seed, levels })) this.begin(round, seed, levels);
  }

  queueInput(input) {
    if (this.closed || this.nextSend > this.nextTick + LAN_DELAY) return;
    const frame = this.nextSend, value = networkInput(input);
    if (this.send({ type: 'input', round: this.round, frame, input: value })) {
      this.localInputs.set(frame, value); this.nextSend++;
    }
  }

  get needsInput() { return !this.closed && this.nextSend <= this.nextTick + LAN_DELAY; }

  takeInput() {
    if (this.closed || !this.localInputs.has(this.nextTick) || !this.remoteInputs.has(this.nextTick)) return null;
    const local = this.localInputs.get(this.nextTick), remote = this.remoteInputs.get(this.nextTick);
    this.localInputs.delete(this.nextTick); this.remoteInputs.delete(this.nextTick++);
    return this.host ? [local, remote] : [remote, local];
  }

  setPaused(value) {
    this.localPaused = value;
    this.send({ type: 'pause', round: this.round, value });
    this.onpause(this.localPaused || this.remotePaused);
  }

  verify(state) {
    if (this.closed || !this.nextTick || this.nextTick % 120) return;
    this.hashes.set(this.nextTick, networkHash(state));
    this.send({ type: 'hash', round: this.round, frame: this.nextTick, hash: this.hashes.get(this.nextTick) });
    this.compareHashes();
  }

  compareHashes() {
    for (const [frame, hash] of this.remoteHashes) if (this.hashes.has(frame)) {
      if (this.hashes.get(frame) !== hash) { this.fail('The games lost synchronization. Reconnect using the same game version.'); return; }
      this.hashes.delete(frame); this.remoteHashes.delete(frame);
    }
    if (this.hashes.size > 4 || this.remoteHashes.size > 4) this.fail('The games stopped synchronizing. Reconnect to play again.');
  }

  receive(raw) {
    if (this.closed) return;
    if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid packet.');
    const message = JSON.parse(raw);
    if (!message || typeof message !== 'object') throw new Error('Invalid packet.');
    this.lastMessage = Date.now();
    if (message.type === 'ping') return;
    if (message.type === 'start') {
      if (this.host || message.round !== this.round + 1 || !Number.isInteger(message.seed) || message.seed < 0 || message.seed > 0xffffffff) throw new Error('Invalid start.');
      if (!Array.isArray(message.levels) || message.levels.length !== 2 || message.levels[0] !== this.remoteLevel || message.levels[1] !== this.level) throw new Error('Player levels changed.');
      this.begin(message.round, message.seed, message.levels); return;
    }
    if (!Number.isInteger(message.round) || message.round > this.round || message.round < 1) throw new Error('Invalid round.');
    if (message.round < this.round) return;
    if (message.type === 'input') {
      if (message.frame !== this.nextRemote || message.frame > this.nextTick + LAN_DELAY * 2 + 2) throw new Error('Invalid frame.');
      this.remoteInputs.set(message.frame, networkInput(message.input)); this.nextRemote++;
    } else if (message.type === 'pause') {
      if (typeof message.value !== 'boolean') throw new Error('Invalid pause.');
      this.remotePaused = message.value; this.onpause(this.localPaused || this.remotePaused);
    } else if (message.type === 'hash') {
      if (!Number.isInteger(message.frame) || message.frame <= 0 || message.frame % 120 || Math.abs(message.frame - this.nextTick) > 120 || !Number.isInteger(message.hash) || message.hash < 0 || message.hash > 0xffffffff || this.remoteHashes.has(message.frame)) throw new Error('Invalid checkpoint.');
      this.remoteHashes.set(message.frame, message.hash); this.compareHashes();
    } else throw new Error('Unknown packet.');
  }

  fail(message) { if (!this.closed) { this.close(); this.onerror(message); } }

  close() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.heartbeat); clearTimeout(this.connectTimeout); this.cancelGather?.();
    this.channel?.close(); this.pc.close();
  }
}
