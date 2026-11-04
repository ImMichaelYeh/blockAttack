// Original composition: a syncopated 16-step bass line with a separate pentatonic lead.
const BASS = [40, 0, 40, 47, 0, 52, 0, 47, 43, 0, 43, 50, 0, 55, 50, 0];
const LEAD = [0, 76, 0, 71, 74, 0, 78, 0, 0, 79, 76, 0, 74, 71, 0, 74];

export class AudioPlayer {
  constructor() { this.enabled = true; this.volume = .4; this.nodes = new Set(); this.timer = null; this.danger = false; }
  async unlock() {
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.applyVolume();
    } catch { /* Audio availability must not prevent play. */ }
  }
  applyVolume() { if (this.master) this.master.gain.setValueAtTime(this.enabled ? this.volume * .22 : 0, this.context.currentTime); }
  tone(note, time, duration = .12, type = 'triangle', volume = .25) {
    if (!this.context || this.context.state !== 'running' || !this.enabled) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .008);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain); gain.connect(this.master); this.nodes.add(oscillator);
    oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time); oscillator.stop(time + duration + .02);
  }
  start() {
    this.stop();
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    this.nextTime = this.context.currentTime + .03; this.step = 0;
    const schedule = () => {
      if (!this.enabled || this.context.state !== 'running') return;
      if (this.nextTime < this.context.currentTime) this.nextTime = this.context.currentTime + .02;
      while (this.nextTime < this.context.currentTime + .15) {
        const index = this.step % 16, note = BASS[index];
        if (note) this.tone(note + (this.danger ? 12 : 0), this.nextTime, .13, 'triangle', .45);
        if (LEAD[index]) this.tone(LEAD[index], this.nextTime, .1, 'sine', this.danger ? .3 : .2);
        if (index % 4 === 0) this.tone(30, this.nextTime, .08, 'sine', .65);
        if (this.danger && index % 2) this.tone(88, this.nextTime, .025, 'triangle', .09);
        this.step++; this.nextTime += this.danger ? .108 : .132;
      }
    };
    schedule(); this.timer = setInterval(schedule, 60);
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already finished. */ } }
    this.nodes.clear();
  }
  noise(time, duration = .22, volume = .3, cutoff = 900) {
    if (!this.context || this.context.state !== 'running' || !this.enabled) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); this.nodes.add(source);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time); source.stop(time + duration + .02);
  }
  cue(type, index = 1) {
    if (!this.context) return;
    const time = this.context.currentTime;
    const notes = type === 'star' ? [84, 91, 96] : type === 'win' ? [72, 76, 79, 84, 79, 84, 88] : type === 'loss' ? [64, 60, 55, 48, 43] : type === 'draw' ? [67, 67] : type === 'chain' ? [76, 79, 84] : type === 'attack' ? [55, 62, 67] : type === 'hit' ? [38, 31] : type === 'incoming' ? [79, 74, 67] : type === 'danger' ? [76, 64, 76, 64] : type === 'ready' ? [60, 67] : type === 'go' ? [72, 79, 84] : type === 'convert' ? [72 + index % 8] : type === 'pop' ? [Math.min(90, 66 + index * 2)] : type === 'swap' ? [62] : type === 'move' || type === 'menu' ? [type === 'move' ? 79 : 72] : [];
    const short = ['swap', 'move', 'menu'].includes(type);
    notes.forEach((note, i) => this.tone(note, time + i * (type === 'win' ? .12 : .075), short ? .035 : type === 'hit' ? .2 : .14, type === 'hit' ? 'sine' : 'triangle', type === 'move' ? .09 : .24));
    if (type === 'hit') this.noise(time, .28, .5, 500);
    else if (type === 'attack' || type === 'incoming') this.noise(time, .12, .13, 2200);
  }
}
