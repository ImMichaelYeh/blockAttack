import { Match, CPU_PROFILES } from './engine.js';
import { CPU_LEVELS, ComputerPlayer } from './cpu.js';

export const SERIES_LENGTHS = Object.freeze({ easy: 10, normal: 11, hard: 12 });
export const SINGLE_LEVELS = CPU_LEVELS;

export class Session {
  constructor({ mode = 'single', difficulty = 'normal', level = 1 } = {}) {
    if (!['single', 'series', 'local'].includes(mode) || !Object.hasOwn(CPU_PROFILES, difficulty)) throw new Error('Choose a valid mode and difficulty.');
    if (mode === 'single' && (!Number.isInteger(level) || level < 1 || level > SINGLE_LEVELS.length)) throw new Error('Choose a whole number of levels from 1 to 10.');
    this.mode = mode;
    this.difficulty = mode === 'single' ? SINGLE_LEVELS[level - 1].difficulty : difficulty;
    this.length = mode === 'series' ? SERIES_LENGTHS[difficulty] : 1;
    this.level = mode === 'single' ? level : 1;
    this.match = null;
    this.stars = [0, 0];
    this.points = [0, 0];
    this.round = 1;
    this.resultRecorded = false;
  }

  get profileStage() {
    return this.level;
  }

  get cpuLevel() {
    if (this.mode === 'single') return this.level;
    const [first, last] = { easy: [1, 4], normal: [3, 7], hard: [6, 10] }[this.difficulty];
    return first + Math.round((this.level - 1) * (last - first) / (this.length - 1));
  }

  get setWinner() { return this.stars[0] >= 2 ? 0 : this.stars[1] >= 2 ? 1 : null; }
  get complete() { return this.mode === 'local' ? this.setWinner !== null : (this.mode === 'single' || this.level === this.length) && this.match?.result === 'win'; }

  start(seed = Date.now()) {
    this.match = new Match(seed, this.difficulty, this.profileStage, {
      cpu: this.mode !== 'local', opponent: this.mode === 'local' ? null : new ComputerPlayer(this.cpuLevel),
    });
    this.resultRecorded = false;
    return this.match;
  }

  recordResult() {
    if (!this.match?.result) throw new Error('Finish the current match first.');
    if (this.resultRecorded) return;
    if (this.mode === 'local' && this.match.result !== 'draw') {
      const winner = this.match.result === 'win' ? 0 : 1;
      this.stars[winner]++;
      this.points[winner]++;
    }
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
