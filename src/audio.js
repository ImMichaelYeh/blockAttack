// Source recordings differ by about 23 dB RMS; separate trims balance their loudness.
export const MUSIC_TRACKS = {
  menu: { src:'./assets/music/puzzlemenu.ogg', gain:.7 },
  game: { src:'./assets/music/DavidKBD - 07 - Long Summer Nights.ogg', gain:.05 },
};
const VICTORY_THEMES = {
  'red-win': { notes: [74,78,81,86,81,86], bass: [50,57,50], step: .13, voice: 'square' },
  'blue-win': { notes: [81,79,78,74,76,78,81,86], bass: [50,57,54,50], step: .1, voice: 'triangle' },
};
const CUE_GAPS = { move:.09, swap:.055, pop:.055, convert:.08, hit:.14, incoming:.45, danger:1.2, menu:.08 };
const POP_NOTES = [74,77,79,81,84,86];
const EFFECTS = {
  star: { notes:[86,90,93], duration:.07, volume:.08, spacing:.055 },
  draw: { notes:[69,62], duration:.12, volume:.13, spacing:.12 },
  incoming: { notes:[69,74], duration:.055, volume:.075, spacing:.065 },
  danger: { notes:[74,77], duration:.065, volume:.07, spacing:.09 },
  ready: { notes:[62,69], duration:.1, volume:.12, spacing:.12 },
  go: { notes:[74,77,81], duration:.09, volume:.15, spacing:.055 },
  swap: { notes:[62], duration:.025, volume:.065, spacing:0 },
  move: { notes:[50], duration:.014, volume:.018, spacing:0 },
  menu: { notes:[74], duration:.035, volume:.09, spacing:0 },
};

export class AudioPlayer {
  constructor() {
    this.enabled = true; this.volume = .4; this.nodes = new Set(); this.danger = false;
    this.lastCue = new Map(); this.voiceUntil = 0;
    this.music = null; this.musicTrack = null; this.musicUpdatedAt = 0;
    this.nextCriticalPulse = 0;
  }
  async unlock() {
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
        const filter = this.context.createBiquadFilter(), compressor = this.context.createDynamicsCompressor();
        filter.type = 'lowpass'; filter.frequency.value = 6200; filter.Q.value = .7;
        compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 3;
        compressor.attack.value = .003; compressor.release.value = .12;
        filter.connect(compressor); compressor.connect(this.master);
        for (const [name, volume] of [['effects',.8],['voice',.9]]) {
          const gain = this.context.createGain(); gain.gain.value = volume; gain.connect(filter); this[name + 'Gain'] = gain;
        }
        this.waves = {};
        for (const type of ['square','sawtooth']) {
          const real = new Float32Array(17), imaginary = new Float32Array(17);
          for (let harmonic = 1; harmonic < imaginary.length; harmonic++) {
            if (type === 'sawtooth' || harmonic % 2) imaginary[harmonic] = Math.exp(-harmonic / 6) / harmonic;
          }
          this.waves[type] = this.context.createPeriodicWave(real, imaginary);
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.applyVolume();
    } catch { /* Audio availability must not prevent play. */ }
  }
  applyVolume() {
    if (this.master) this.master.gain.setValueAtTime(this.enabled ? this.volume * .22 : 0, this.context.currentTime);
    this.updateMusic(true);
  }
  tone(note, time, duration = .12, type = 'triangle', volume = .25, endNote) {
    if (!this.context || this.context.state !== 'running' || !this.enabled) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
    if (this.waves?.[type]) oscillator.setPeriodicWave(this.waves[type]);
    if (endNote !== undefined) {
      oscillator.frequency.setValueAtTime(oscillator.frequency.value, time);
      oscillator.frequency.exponentialRampToValueAtTime(440 * 2 ** ((endNote - 69) / 12), time + duration);
    }
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .008);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain); gain.connect(this.effectsGain || this.master); this.nodes.add(oscillator);
    oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time); oscillator.stop(time + duration + .02);
  }
  start(track = 'game', restart = false) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    if (!Object.hasOwn(MUSIC_TRACKS, track) || typeof globalThis.Audio !== 'function') return;
    try {
      if (!this.music) {
        this.music = new globalThis.Audio(); this.music.loop = true; this.music.preservesPitch = true;
      }
      if (this.musicTrack !== track) {
        this.music.pause(); this.music.src = MUSIC_TRACKS[track].src; this.musicTrack = track; restart = true;
      }
      if (restart) this.music.currentTime = 0;
      this.updateMusic(true);
      if (this.music.paused) this.music.play()?.catch(() => {});
    } catch { /* Missing/blocked media must not prevent play. */ }
  }
  updateMusic(immediate = false) {
    if (!this.music || !this.musicTrack) return;
    const now = this.context?.currentTime || 0, speaking = now < this.voiceUntil;
    const target = this.enabled ? this.volume * MUSIC_TRACKS[this.musicTrack].gain * (speaking ? .5 : 1) : 0;
    const elapsed = Math.max(0, now - this.musicUpdatedAt);
    const mix = immediate || !this.enabled ? 1 : 1 - Math.exp(-elapsed / (speaking ? .025 : .12));
    this.music.volume = mix === 1 ? target : this.music.volume + (target - this.music.volume) * mix;
    const critical = this.musicTrack === 'game' && this.danger;
    const rate = critical ? 1.4 : 1;
    if (this.music.playbackRate !== rate) this.music.playbackRate = rate;
    if (!critical || !this.enabled || this.music.paused) this.nextCriticalPulse = 0;
    else if (this.context?.state === 'running' && now >= this.nextCriticalPulse && !speaking) {
      this.tone(43, now, .065, 'sine', .14, 26);
      this.tone(43, now + .12, .055, 'sine', .09, 26);
      this.nextCriticalPulse = now + .85;
    }
    this.musicUpdatedAt = now;
  }
  stop() {
    this.music?.pause();
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already finished. */ } }
    this.nodes.clear();
    this.lastCue.clear(); this.voiceUntil = 0; this.nextCriticalPulse = 0;
    const gain = this.effectsGain?.gain;
    if (this.context && gain) { gain.cancelScheduledValues(this.context.currentTime); gain.setValueAtTime(.8, this.context.currentTime); }
  }
  noise(time, duration = .22, volume = .3, cutoff = 900) {
    if (!this.context || this.context.state !== 'running' || !this.enabled) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.effectsGain || this.master); this.nodes.add(source);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time); source.stop(time + duration + .02);
  }
  vocal(note, time, duration, vowels, endVowels, endNote, volume = .7) {
    if (!this.context || this.context.state !== 'running' || !this.enabled) return;
    const source = this.context.createOscillator(), gain = this.context.createGain();
    source.type = 'sawtooth';
    if (this.waves?.sawtooth) source.setPeriodicWave(this.waves.sawtooth);
    const frequency = 440 * 2 ** ((note - 69) / 12), ending = 440 * 2 ** ((endNote - 69) / 12);
    source.frequency.setValueAtTime(frequency, time);
    // Pitch flutter and moving vowel resonances make a character call rather than a musical beep.
    for (let step = 1; step <= 6; step++) {
      const progress = step / 6;
      source.frequency.exponentialRampToValueAtTime(frequency * (ending / frequency) ** progress * (step % 2 ? 1.01 : .99), time + duration * progress);
    }
    const filters = vowels.map((frequency, index) => {
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass'; filter.Q.value = 5;
      filter.frequency.setValueAtTime(frequency, time);
      filter.frequency.exponentialRampToValueAtTime(endVowels[index], time + duration * .85);
      source.connect(filter); filter.connect(gain);
      return filter;
    });
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .018);
    gain.gain.setValueAtTime(volume * .8, time + duration * .65);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    gain.connect(this.voiceGain || this.master); this.nodes.add(source);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); gain.disconnect(); for (const filter of filters) filter.disconnect(); };
    source.start(time); source.stop(time + duration + .02);
  }
  cue(type, index = 1, player = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const time = this.context.currentTime;
    const gap = CUE_GAPS[type];
    if (gap) {
      if (time - (this.lastCue.get(type) ?? -Infinity) < gap) return;
      this.lastCue.set(type, time);
    }
    const theme = VICTORY_THEMES[type === 'win' ? 'red-win' : type];
    if (theme) {
      const start = time + .04;
      theme.notes.forEach((note, i) => {
        const beat = start + i * theme.step, duration = i === theme.notes.length - 1 ? .38 : .12;
        this.tone(note, beat, duration, theme.voice, .17);
      });
      theme.bass.forEach((note, i) => {
        this.tone(note, start + i * theme.step * 2, .18, 'triangle', .23);
      });
      return;
    }
    if (type === 'loss') {
      [69,65,62,50].forEach((note, i) => this.tone(note, time + i * .1, i === 3 ? .24 : .11, 'triangle', .14));
      return;
    }
    if (type === 'attack' || type === 'chain') {
      const chain = type === 'chain', power = Math.max(1, Math.min(5, chain ? index : (index - 3) / 3));
      const key = 'voice-' + player, start = Math.max(time, this.voiceUntil);
      if (time - (this.lastCue.get(key) ?? -Infinity) < .3 || start - time > .3) return;
      this.lastCue.set(key, time);
      if (player === 0) {
        // Red is a bold, warm little firecracker: one compact "HRAH!", with a chain reply.
        this.vocal(50, start, .21 + power * .009, [650,1100,2300], [450,1050,1900], 43, .74);
        if (chain) this.vocal(57, start + .16, .1, [700,1200,2400], [500,1100,2100], 50, .48);
      } else {
        // Blue is cheeky and springy: a rounded "BUP-BWIP!", with a quick chain yip.
        this.vocal(62, start, .095, [350,900,2000], [450,1700,2400], 69, .5);
        this.vocal(67, start + .075, .13 + power * .006, [600,1300,2300], [400,1400,2100], 62, .55);
        if (chain) this.vocal(74, start + .18, .08, [400,1800,2500], [500,1400,2200], 69, .38);
      }
      this.voiceUntil = start + .27;
      const gain = this.effectsGain?.gain;
      if (gain) {
        gain.cancelScheduledValues(time);
        gain.setTargetAtTime(.5, time, .015);
        gain.setTargetAtTime(.8, this.voiceUntil, .1);
      }
      return;
    }
    if (type === 'hit') {
      this.tone(50, time, .09, 'sine', .24, 38);
      this.noise(time, .065, .09, 700);
      return;
    }
    const quiet = time < this.voiceUntil ? .45 : 1;
    if (type === 'pop' || type === 'convert') {
      this.tone(POP_NOTES[Math.min(POP_NOTES.length - 1, Math.max(0, index))] - (type === 'convert' ? 12 : 0), time, .035, 'triangle', (type === 'pop' ? .1 : .065) * quiet);
      return;
    }
    const effect = EFFECTS[type];
    if (effect) effect.notes.forEach((note, i) => this.tone(note, time + i * effect.spacing, effect.duration, 'triangle', effect.volume));
  }
}
