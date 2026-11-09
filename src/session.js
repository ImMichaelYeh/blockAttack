import { Match, CPU_PROFILES } from './engine.js';

export const SERIES_LENGTHS = Object.freeze({ easy: 10, normal: 11, hard: 12 });
// One encounter per distinct CPU configuration, ordered by reaction interval, chains, then raising.
export const SINGLE_LEVELS = Object.freeze([
  ...Array.from({ length: 8 }, (_, index) => ['easy', index + 1]),
  ['normal', 1], ['easy', 9], ['normal', 2], ['easy', 10],
  ['normal', 4], ['normal', 5], ['normal', 7], ['hard', 4],
  ['normal', 9], ['normal', 11], ['hard', 9], ['hard', 12],
].map(([difficulty, stage]) => Object.freeze({ difficulty, stage })));

export class Session {
  constructor({ mode = 'single', difficulty = 'normal', level = 1 } = {}) {
    if (!['single', 'series', 'local'].includes(mode) || !Object.hasOwn(CPU_PROFILES, difficulty)) throw new Error('Choose a valid mode and difficulty.');
    if (mode === 'single' && (!Number.isInteger(level) || level < 1 || level > SINGLE_LEVELS.length)) throw new Error('Choose a whole number of levels from 1 to 20.');
    this.mode = mode;
    this.difficulty = mode === 'single' ? SINGLE_LEVELS[level - 1].difficulty : difficulty;
    this.length = mode === 'series' ? SERIES_LENGTHS[difficulty] : 1;
    this.level = mode === 'single' ? level : 1;
    this.match = null;
    this.stars = [0, 0];
    this.round = 1;
    this.resultRecorded = false;
  }

  get profileStage() {
    return this.mode === 'single' ? SINGLE_LEVELS[this.level - 1].stage : this.level;
  }

  get setWinner() { return this.stars[0] >= 2 ? 0 : this.stars[1] >= 2 ? 1 : null; }
  get complete() { return this.mode === 'local' ? this.setWinner !== null : (this.mode === 'single' || this.level === this.length) && this.match?.result === 'win'; }

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
    else if (this.complete && this.mode === 'series') this.level = 1;
    return this.start(seed);
  }
}
