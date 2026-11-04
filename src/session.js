import { Match, CPU_PROFILES } from './engine.js';

export class Session {
  constructor({ mode = 'single', difficulty = 'normal', length = 5 } = {}) {
    if (!['single', 'series', 'local'].includes(mode) || !Object.hasOwn(CPU_PROFILES, difficulty)) throw new Error('Choose a valid mode and difficulty.');
    if (mode === 'series' && (!Number.isInteger(length) || length < 1 || length > 10)) throw new Error('Choose a whole number of levels from 1 to 10.');
    this.mode = mode;
    this.difficulty = difficulty;
    this.length = mode === 'series' ? length : 1;
    this.level = 1;
    this.match = null;
    this.stars = [0, 0];
    this.round = 1;
    this.resultRecorded = false;
  }

  get profileStage() {
    const count = CPU_PROFILES[this.difficulty].intervals.length;
    return this.length === 1 ? 1 : 1 + Math.round((this.level - 1) * (count - 1) / (this.length - 1));
  }

  get setWinner() { return this.stars[0] >= 2 ? 0 : this.stars[1] >= 2 ? 1 : null; }
  get complete() { return this.mode === 'local' ? this.setWinner !== null : this.level === this.length && this.match?.result === 'win'; }

  start(seed = Date.now()) {
    this.match = new Match(seed, this.difficulty, this.profileStage, { cpu: this.mode !== 'local' });
    this.resultRecorded = false;
    return this.match;
  }

  recordResult() {
    if (!this.match?.result) throw new Error('Finish the current match first.');
    if (this.resultRecorded) return;
    if (this.mode === 'local' && this.match.result !== 'draw') this.stars[this.match.result === 'win' ? 0 : 1]++;
    this.resultRecorded = true;
  }

  continue(seed = Date.now()) {
    if (!this.match?.result) throw new Error('Finish the current match first.');
    if (this.mode === 'local') {
      this.recordResult();
      if (this.complete) { this.stars = [0, 0]; this.round = 1; }
      else if (this.match.result !== 'draw') this.round++;
      return this.start(seed);
    }
    if (this.match.result === 'win' && this.mode === 'series' && !this.complete) this.level++;
    else if (this.complete) this.level = 1;
    return this.start(seed);
  }
}
