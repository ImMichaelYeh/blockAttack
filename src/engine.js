export const COLS = 6;
export const ROWS = 12;
export const HEIGHT = 24;
export const TICK_RATE = 60;

// shortcut: Endless ceiling grace remains provisional; Story uses its measured profile below.
export const TIMING = Object.freeze({ swap: 4, fall: 1, landing: 12, garbageHold: 1, garbageHover: 25, danger: 150, raiseRepeat: 16, raisePause: 4, autoPause: 3 });

export const STORY_STOP_PROFILES = Object.freeze({
  easy: Object.freeze({ grace: 100, combo: Object.freeze([0, 56, 74, 92, 110, 128, 146, 164, 182, 200]), chain: Object.freeze([113, 131, 149]), dangerChain: Object.freeze([170, 188, 206]) }),
  normal: Object.freeze({ grace: 65, combo: Object.freeze([0, 48, 62, 76, 90, 104, 118, 132, 146, 160]), chain: Object.freeze([99, 113, 127]), dangerChain: Object.freeze([150, 164, 178]) }),
  hard: Object.freeze({ grace: 40, combo: Object.freeze([0, 42, 52, 62, 72, 82, 92, 102, 112, 122]), chain: Object.freeze([85, 95, 105]), dangerChain: Object.freeze([130, 140, 150]) }),
});

// Verified stock runtime range; the native displayed Endless level can continue to 99.
export const SPEED_WORDS = Object.freeze([
  71, 68, 80, 85, 89, 97, 104, 112, 119, 132, 144, 154, 175, 187, 200, 214, 228, 243, 260, 277,
  296, 316, 337, 360, 385, 412, 439, 471, 508, 550, 595, 648, 704, 762, 819, 897, 978, 1040, 1129, 1213,
  1310, 1394, 1524, 1638, 1771, 1872, 1985, 2114, 2259, 2340,
]);
export const SPEED_PANELS = Object.freeze([
  9, 12, 12, 12, 12, 12, 14, 14, 16, 16, 24, 24, 24, 24, 24, 22, 20, 18, 16, 16,
  36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39,
  45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
]);
export const STORY_SPEED_FRAMES = Object.freeze([
  900, 900, 900, 900, 600, 600, 600, 600, 540, 540, 540, 540, 480, 480, 480, 480,
  420, 420, 420, 420, 420, 420, 420, 420, 360, 360, 360, 360,
  300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300,
]);

// One registration step, then 2F flashing steps; face includes three transition steps. Pop interval = P+1.
export const TIMING_PROFILES = Object.freeze({
  story: Object.freeze({
    easy: Object.freeze({ hover: 12, flash: 44, face: 23, pop: 9 }),
    normal: Object.freeze({ hover: 10, flash: 42, face: 21, pop: 8 }),
    hard: Object.freeze({ hover: 6, flash: 36, face: 19, pop: 8 }),
  }),
  endless: Object.freeze({
    easy: Object.freeze({ hover: 12, flash: 44, face: 25, pop: 9 }),
    normal: Object.freeze({ hover: 9, flash: 36, face: 20, pop: 8 }),
    hard: Object.freeze({ hover: 6, flash: 28, face: 15, pop: 7 }),
  }),
});

const COMBO_WIDTHS = { 4: [3], 5: [4], 6: [5], 7: [6], 8: [3, 4], 9: [4, 4], 10: [5, 5], 11: [5, 6], 12: [6, 6] };
const ATTACK_DELAYS = { '4:0:0': 161, '5:0:0': 161, '6:0:0': 161, '4:2:0': 158, '4:0:6': 155, '8:2:2': 155, '12:0:1': 159 };
const SHOCK_COLUMNS = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 5, 5, 5, 5];

export function randomGenerator(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function panel(kind, extra = {}) {
  return { kind, phase: 'idle', timer: 0, chain: 0, landing: 0, ...extra };
}

export const isPanel = cell => cell != null && !('garbage' in cell);
const canMatch = cell => isPanel(cell) && cell.phase === 'idle';

export function findMatches(grid) {
  const found = new Set();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = grid[y]?.[x];
      if (!canMatch(cell)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const run = [];
        let xx = x;
        let yy = y;
        while (xx < COLS && yy < HEIGHT && canMatch(grid[yy]?.[xx]) && grid[yy][xx].kind === cell.kind) {
          run.push(yy * COLS + xx);
          xx += dx;
          yy += dy;
        }
        if (run.length >= 3) for (const position of run) found.add(position);
      }
    }
  }
  return [...found].map(position => ({ x: position % COLS, y: Math.floor(position / COLS) }));
}

export class Board {
  constructor(seed = 1, { autoRise = true, speedLevel, starter = false, mode = 'story', difficulty = 'normal', rowState = { alternate: 0 } } = {}) {
    this.timing = TIMING_PROFILES[mode]?.[difficulty] || TIMING_PROFILES.story.normal;
    this.mode = mode === 'endless' ? 'endless' : 'story';
    this.difficulty = TIMING_PROFILES[this.mode][difficulty] ? difficulty : 'normal';
    this.stopTiming = STORY_STOP_PROFILES[this.difficulty];
    this.graceTicks = this.mode === 'story' ? this.stopTiming.grace : TIMING.danger;
    const initialSpeed = this.mode === 'endless' ? 1 : ({ easy: 5, normal: 13, hard: 21 }[difficulty] || 13);
    this.speedLevel = Number.isFinite(speedLevel) ? Math.max(1, Math.min(50, Math.trunc(speedLevel))) : initialSpeed;
    this.displaySpeedLevel = this.speedLevel;
    this.speedWord = SPEED_WORDS[this.speedLevel - 1];
    this.speedPanels = SPEED_PANELS[this.speedLevel - 1];
    this.speedStage = 0;
    this.speedProgress = 0;
    this.riseAccumulator = 4095;
    this.autoRise = autoRise;
    this.random = randomGenerator(seed);
    this.rowState = rowState;
    this.shockQuota = this.mode === 'story' ? ({ easy: 14, normal: 19, hard: 26 }[this.difficulty]) : 0;
    this.shockRemaining = this.shockQuota;
    this.shockCredits = 0;
    this.shocksEarned = 0;
    this.placement = { 3: 0, 4: 0, 5: 0, 6: 0 };
    this.admissionBlocked = false;
    this.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
    this.cursor = { x: 2, y: 0 };
    this.garbage = [];
    this.conversions = [];
    this.nextGarbageId = 1;
    this.nextRow = [];
    this.rise = 0;
    this.raiseHeld = false;
    this.raiseQueued = false;
    this.raiseRemaining = 0;
    this.raisePause = 0;
    this.raiseDelay = null;
    this.stop = 0;
    this.stopRequest = null;
    this.clearHold = 0;
    this.landingHold = 0;
    this.graceUsed = false;
    this.dangerFlags = Array(COLS).fill(false);
    this.danger = 0;
    this.lost = false;
    this.tick = 0;
    this.score = 0;
    this.cleared = 0;
    this.bestChain = 1;
    this.chainDepth = 0;
    this.banner = null;
    this.events = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < COLS; x++) {
        if (y === 0 && starter) {
          this.grid[y][x] = panel([1, 1, 3, 1, 2, 4][x]);
          continue;
        }
        let kind;
        do {
          kind = Math.floor(this.random() * 5);
        } while ((x > 1 && this.grid[y][x - 1]?.kind === kind && this.grid[y][x - 2]?.kind === kind) ||
          (y > 1 && this.grid[y - 1][x]?.kind === kind && this.grid[y - 2][x]?.kind === kind));
        this.grid[y][x] = panel(kind);
      }
    }
    // A stepped skyline gives the player space to read the opening board.
    this.grid[5][0] = null;
    this.grid[5][4] = null;
    this.grid[5][5] = null;
    this.nextRow = this.makeRow();
  }

  makeRow() {
    const row = [];
    const mode = this.mode === 'story' ? (this.difficulty === 'hard' ? 1 : 0) : ({ easy: 0, normal: 1, hard: 2 }[this.difficulty]);
    const distance = mode === 2 || (mode === 1 && this.rowState.alternate) ? 1 : 2;
    for (let x = 0; x < COLS; x++) {
      let kind;
      do {
        // shortcut: sixth-color Endless presentation remains S23; Story uses five ordinary colors.
        kind = Math.floor(this.random() * 5);
      } while ((isPanel(this.grid[0][x]) && this.grid[0][x].kind === kind) || (x >= distance && row[x - distance].kind === kind));
      row.push(panel(kind));
    }
    this.rowState.alternate ^= 1;
    if (this.shockCredits > 0) {
      // shortcut: use the verified single-credit mask for multi-credit rows until S12a-F3.
      let x;
      for (let attempt = 0; attempt < 16; attempt++) {
        x = SHOCK_COLUMNS[Math.floor(this.random() * SHOCK_COLUMNS.length)];
        if (this.grid[0][x]?.kind !== 5) break;
      }
      row[x] = panel(5);
      this.shockCredits--;
    }
    return row;
  }

  move(dx, dy) {
    const { x, y } = this.cursor;
    this.cursor.x = Math.max(0, Math.min(COLS - 2, this.cursor.x + dx));
    this.cursor.y = Math.max(0, Math.min(ROWS - 2, this.cursor.y + dy));
    return x !== this.cursor.x || y !== this.cursor.y;
  }

  canSwap(x, y) {
    if (x < 0 || x >= COLS - 1 || y < 0 || y >= ROWS) return false;
    const cells = [this.grid[y][x], this.grid[y][x + 1]];
    return cells.some(Boolean) && cells.every(cell => !cell || (isPanel(cell) &&
      (['idle', 'hover'].includes(cell.phase) || (cell.phase === 'swap' && cell.swapX === x))));
  }

  swap() {
    const { x, y } = this.cursor;
    if (this.lost || !this.canSwap(x, y)) return false;
    const left = this.grid[y][x];
    const right = this.grid[y][x + 1];
    this.grid[y][x] = right;
    this.grid[y][x + 1] = left;
    for (const [cell, from] of [[right, 1], [left, -1]]) {
      if (!cell) continue;
      // Preserve the on-screen position when reversing an unfinished swap.
      const offset = cell.phase === 'swap' ? cell.from * cell.timer / TIMING.swap : 0;
      if (cell.phase !== 'swap') cell.swapOrder = from > 0 ? x : x + 1;
      cell.phase = 'swap';
      cell.timer = TIMING.swap;
      cell.from = from + offset;
      cell.swapX = x;
    }
    return true;
  }

  occupiedHeight(includeFallingGarbage = true) {
    for (let y = HEIGHT - 1; y >= 0; y--) if (this.grid[y].some(cell => cell &&
      (includeFallingGarbage || !('garbage' in cell) || this.garbage.find(block => block.id === cell.garbage)?.phase !== 'fall'))) return y + 1;
    return 0;
  }

  atCeiling() {
    return this.grid.slice(ROWS - 1).some(row => row.some(cell => cell &&
      (!('garbage' in cell) || this.garbage.find(block => block.id === cell.garbage)?.phase !== 'fall')));
  }

  addGarbage({ width, height = 1, metal = false, sender }) {
    if (this.lost) return false;
    width = Math.max(3, Math.min(COLS, width));
    height = Math.max(1, Math.min(4, height));
    if (this.grid.slice(ROWS - 1).some(row => row.some(Boolean)) || this.admissionBlocked || this.clearHold || this.landingHold || this.conversions.length ||
      this.garbage.some(block => block.phase !== 'idle') || this.grid.some(row => row.some(cell => isPanel(cell) && ['clear', 'hover', 'fall', 'recover'].includes(cell.phase)))) return false;
    const x = this.placement[width];
    const y = ROWS - 1;
    if (y + height > HEIGHT) return false;
    this.placement[width] = width === 3 ? (x ? 0 : 3) : (x + 1) % (COLS - width + 1);
    // One additional visible hold tick, then one row per tick; admission runs after board physics.
    const block = { id: this.nextGarbageId++, x, y, width, height, metal, sender, incoming: true, phase: 'fall', timer: 2, fromY: 0 };
    this.garbage.push(block);
    this.writeBlock(block);
    return true;
  }

  writeBlock(block, clear = false) {
    for (let y = block.y; y < block.y + block.height; y++) {
      for (let x = block.x; x < block.x + block.width; x++) {
        this.grid[y][x] = clear ? null : { garbage: block.id };
      }
    }
  }

  activateGarbage(matches, chain, clearDuration) {
    const pending = new Set();
    for (const { x, y } of matches) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = this.grid[y + dy]?.[x + dx]?.garbage;
        if (id) pending.add(id);
      }
    }
    for (const id of pending) {
      const block = this.garbage.find(item => item.id === id);
      if (!block || block.phase === 'convert') continue;
      const members = [block];
      for (const member of members) for (const other of this.garbage) {
        if (members.includes(other) || other.phase === 'convert' || Boolean(other.metal) !== Boolean(member.metal)) continue;
        const horizontal = (member.x + member.width === other.x || other.x + other.width === member.x) &&
          member.y < other.y + other.height && other.y < member.y + member.height;
        const vertical = (member.y + member.height === other.y || other.y + other.height === member.y) &&
          member.x < other.x + other.width && other.x < member.x + member.width;
        if (horizontal || vertical) members.push(other);
      }
      // Native conversion starts three pop slots after ordinary support disappears.
      const group = { id: block.id, blocks: members.map(member => member.id), steps: [], next: 0,
        stage: 'flash', age: 0, faceAt: 1 + this.timing.flash,
        timer: clearDuration + 3 * this.timing.pop, chain };
      for (const member of members) {
        Object.assign(member, { phase: 'convert', timer: 0, conversion: group.id, revealed: 0, retiled: 0 });
        member.preview = this.makeRow().slice(member.x, member.x + member.width).map(cell =>
          panel(cell.kind === 5 ? 0 : cell.kind, { phase: 'convert', chain, timer: 0 }));
        for (let row = 0; row < member.height; row++) for (let column = 0; column < member.width; column++) {
          group.steps.push({ blockId: member.id, x: member.x + column, y: member.y + row, ordinaryPreview: row === 0 });
        }
      }
      group.steps.sort((a, b) => a.y - b.y || b.x - a.x);
      this.conversions.push(group);
    }
  }

  updateConversions() {
    for (const group of [...this.conversions]) {
      group.age++;
      if (group.stage === 'flash' && group.age >= group.faceAt) group.stage = 'face';
      const members = group.blocks.map(id => this.garbage.find(block => block.id === id));
      for (const block of members) for (const cell of block.preview) if (cell.timer > 0) cell.timer--;
      if (group.timer > 0) group.timer--;
      if (group.timer) continue;
      if (group.stage !== 'hold') {
        const step = group.steps[group.next++];
        const block = members.find(block => block.id === step.blockId);
        if (step.ordinaryPreview) {
          block.preview[step.x - block.x].timer = TIMING.landing;
          block.revealed++;
        } else block.retiled++;
        group.stage = group.next === group.steps.length ? 'hold' : 'reveal';
        group.timer = group.stage === 'hold' ? TIMING.garbageHold : this.timing.pop;
        this.events.push({ type: 'convert', x: step.x, y: step.y, index: group.next, chain: group.chain, ordinaryPreview: step.ordinaryPreview });
        continue;
      }
      // Every member stays solid until the shared traversal and hold have finished.
      for (const block of members) {
        for (let column = 0; column < block.width; column++) {
          this.grid[block.y][block.x + column] = Object.assign(block.preview[column], { phase: 'recover', timer: TIMING.garbageHover });
        }
        block.y++;
        block.height--;
        block.phase = 'idle';
        delete block.preview;
        delete block.revealed;
        delete block.retiled;
        delete block.conversion;
      }
      this.garbage = this.garbage.filter(block => block.height > 0);
      this.conversions = this.conversions.filter(item => item !== group);
    }
  }

  updateGarbage() {
    this.updateConversions();
    for (const block of [...this.garbage].sort((a, b) => a.y - b.y)) {
      if (block.phase === 'convert') continue;
      if (block.timer > 0) block.timer--;
      if (block.timer) continue;
      const canFall = block.y > 0 && this.grid[block.y - 1].slice(block.x, block.x + block.width).every(cell => !cell);
      if (canFall) {
        this.writeBlock(block, true);
        block.y--;
        this.writeBlock(block);
        block.phase = 'fall';
        block.timer = 1;
        block.fromY = 1;
      } else {
        if (block.phase === 'fall') {
          this.events.push({ type: 'land', incoming: Boolean(block.incoming), x: block.x, y: block.y, width: block.width, height: block.height });
          block.incoming = false;
        }
        block.phase = 'idle';
        block.fromY = 0;
      }
    }
  }

  stopGrant({ count, chain, shocks }) {
    if (shocks || count > 12 || chain > 4 || (this.mode === 'endless' && this.difficulty !== 'normal')) {
      // shortcut: retain the old grant for S11a-F1's unmeasured sizes/shocks and Endless Easy/Hard.
      return count >= 4 || chain > 1 || shocks ? Math.min(240, 45 + count * 7 + chain * 20) : 0;
    }
    if (this.mode === 'endless') return Math.max(count >= 4 ? 30 * (count - 1) : 0, chain > 1 ? 60 * chain + 105 : 0);
    const high = this.dangerFlags.some(Boolean);
    const combo = count < 4 ? 0 : high ? this.stopTiming.chain[count <= 8 ? 0 : count <= 10 ? 1 : 2] : this.stopTiming.combo[count - 3];
    const chained = chain > 1 ? (high ? this.stopTiming.dangerChain : this.stopTiming.chain)[chain - 2] : 0;
    return Math.max(combo, chained);
  }

  step({ raise = false, raisePressed = false, scanPhase = this.tick % 3 } = {}) {
    this.events = [];
    if (this.lost) return this.events;
    if (raisePressed || (raise && !this.raiseHeld)) this.raiseQueued = true;
    this.raiseHeld = Boolean(raise);
    this.tick++;
    if (this.stopRequest) {
      this.stop = Math.max(this.stop, this.stopGrant(this.stopRequest));
      this.stopRequest = null;
    }
    if (this.mode === 'story') {
      if (this.speedProgress >= STORY_SPEED_FRAMES[this.speedStage]) {
        this.speedProgress = 0;
        this.speedStage = Math.min(STORY_SPEED_FRAMES.length - 1, this.speedStage + 1);
        this.speedLevel = Math.min(50, this.speedLevel + 1);
        this.displaySpeedLevel = this.speedLevel;
        this.speedWord = SPEED_WORDS[this.speedLevel - 1];
      }
      this.speedProgress++;
    }
    if (this.banner && --this.banner.life <= 0) this.banner = null;

    const removed = [];
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = this.grid[y][x];
        if (!isPanel(cell)) continue;
        if (cell.landing > 0) cell.landing--;
        if (cell.timer > 0) {
          cell.timer--;
          if (cell.phase === 'clear' && !cell.popped && cell.clearDuration - cell.timer >= cell.popAt) {
            cell.popped = true;
            if (this.shockQuota && this.shocksEarned < 15 && --this.shockRemaining === 0) {
              this.shockRemaining = this.shockQuota;
              this.shockCredits++;
              this.shocksEarned++;
            }
            if (this.mode === 'endless' && --this.speedPanels === 0) {
              this.speedLevel = Math.min(50, this.speedLevel + 1);
              this.displaySpeedLevel = Math.min(99, this.displaySpeedLevel + 1);
              this.speedWord = SPEED_WORDS[this.speedLevel - 1];
              this.speedPanels = SPEED_PANELS[this.speedLevel - 1];
            }
            this.events.push({ type: 'pop', index: cell.popIndex, chain: cell.depth, x, y });
          }
          if (cell.timer !== 0) continue;
          if (cell.phase === 'clear') {
            removed.push({ x, y, chain: cell.depth });
            this.grid[y][x] = null;
          } else if (cell.phase === 'recover') {
            // Conversion already supplied the wait; enter gravity without another ordinary hover.
            cell.phase = 'fall';
          } else if (!['hover', 'fall'].includes(cell.phase)) {
            cell.phase = 'idle';
          }
        }
      }
    }
    for (const { x, y, chain } of removed) {
      for (let yy = y + 1; yy < HEIGHT; yy++) {
        const above = this.grid[yy][x];
        if (above?.garbage) break;
        if (isPanel(above) && above.phase !== 'clear') {
          above.chain = Math.max(above.chain, chain);
        }
      }
    }
    this.updateGarbage();
    // Native clear cleanup holds its timer two ticks and row movement three ticks from removal.
    if (removed.length) this.clearHold = 3;

    // A vacated cell lets the rest of its falling column follow without another hover.
    const vacated = new Set();
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = this.grid[y][x];
        if (!isPanel(cell) || !['idle', 'hover', 'fall'].includes(cell.phase)) continue;
        if (cell.phase === 'fall' && cell.timer > 0) continue;
        const below = this.grid[y - 1]?.[x];
        if (isPanel(below) && below.phase === 'hover') {
          cell.phase = 'hover';
          cell.timer = below.timer;
          continue;
        }
        if (isPanel(below) && below.phase === 'fall') continue;
        const unsupported = y > 0 && !this.grid[y - 1][x];
        if (unsupported) {
          if (cell.phase === 'idle' && !vacated.has((y - 1) * COLS + x)) {
            cell.phase = 'hover';
            cell.timer = this.timing.hover;
          } else if (cell.phase === 'fall' || cell.timer === 0 || vacated.has((y - 1) * COLS + x)) {
            this.grid[y - 1][x] = cell;
            this.grid[y][x] = null;
            vacated.add(y * COLS + x);
            cell.phase = 'fall';
            cell.timer = TIMING.fall;
            cell.landing = 0;
          }
        } else if (cell.phase === 'hover' || cell.phase === 'fall') {
          cell.phase = 'idle';
          cell.timer = 0;
          cell.landing = TIMING.landing;
          this.landingHold = 3;
        }
      }
    }

    const matches = findMatches(this.grid);
    if (matches.length) {
      const eligible = Math.max(0, ...matches.map(({ x, y }) => this.grid[y][x].chain));
      // Native overlapping branches share one board chain; a simultaneous clear adds one link.
      const chain = eligible ? Math.max(this.chainDepth + 1, eligible + 1) : 1;
      this.chainDepth = Math.max(this.chainDepth, chain);
      const shocks = matches.filter(({ x, y }) => this.grid[y][x].kind === 5).length;
      const firstPop = 1 + this.timing.flash + this.timing.face;
      const clearDuration = firstPop + (matches.length - 1) * this.timing.pop;
      this.activateGarbage(matches, chain, clearDuration);
      const popOrder = [...matches].sort((a, b) => b.y - a.y || a.x - b.x);
      for (const [index, { x, y }] of popOrder.entries()) {
        Object.assign(this.grid[y][x], { phase: 'clear', timer: clearDuration, clearDuration,
          faceAt: 1 + this.timing.flash, popAt: firstPop + index * this.timing.pop,
          popIndex: index + 1, popped: false, depth: chain });
      }
      this.cleared += matches.length;
      this.score += matches.length * 10 + (matches.length >= 4 ? matches.length * 20 : 0) + (chain > 1 ? 100 * 2 ** Math.min(chain - 2, 8) : 0);
      this.bestChain = Math.max(this.bestChain, chain);
      if (matches.length >= 4 || chain > 1 || shocks) {
        this.stopRequest = { count: matches.length, chain, shocks };
        this.banner = { count: matches.length, chain, shock: shocks > 0, life: 100, x: popOrder[0].x, y: popOrder[0].y };
      }
      this.events.push({ type: 'clear', count: matches.length, chain, shocks, x: popOrder[0].x, y: popOrder[0].y });
    }

    for (const row of this.grid) {
      for (const cell of row) {
        // Chain eligibility belongs to the fall/landing, not a grace period after settling.
        if (canMatch(cell)) cell.chain = 0;
      }
    }
    const chainPending = this.grid.some(row => row.some(cell => isPanel(cell) && (cell.phase === 'clear' || cell.chain > 0))) || this.conversions.length > 0;
    if (this.chainDepth && !chainPending) {
      if (this.chainDepth > 1) this.events.push({ type: 'chain-end', chain: this.chainDepth });
      this.chainDepth = 0;
    }
    const converting = this.conversions.length > 0 || this.grid.some(row => row.some(cell => isPanel(cell) && ['convert', 'recover'].includes(cell.phase)));
    const clearActive = this.clearHold > 1 || this.grid.some(row => row.some(cell => isPanel(cell) && cell.phase === 'clear'));
    // shortcut: keep garbage/conversion/recovery timer suspension until S11a-F2 verifies those phases.
    const timerFrozen = clearActive || converting || this.garbage.some(block => block.phase !== 'idle');
    const resolving = timerFrozen || this.clearHold > 0 || this.landingHold > 0 || this.grid.some(row => row.some(cell => isPanel(cell) && ['hover', 'fall'].includes(cell.phase)));
    if (raise || raisePressed) this.stop = 0;
    else if (!timerFrozen) this.stop = Math.max(0, this.stop - 1);
    if (!this.raiseRemaining && !this.raiseQueued && !raise) this.raiseDelay = null;
    if (!this.atCeiling()) {
      if (this.raiseRemaining === 0 && (this.raiseQueued || raise)) {
        this.raiseRemaining = 1;
        this.raiseQueued = false;
        if (this.raiseDelay === null) this.raiseDelay = 2;
      }
    }
    const preparing = this.raiseRemaining > 0 && this.raiseDelay > 0;
    if (this.raiseRemaining > 0 && !timerFrozen) {
      // Buffered clear-time taps intentionally survive, unlike released native taps.
      if (!this.atCeiling()) this.stop = 0;
      if (preparing) this.raiseDelay--;
    }
    if (!resolving && !this.stop && !this.atCeiling()) {
      const manualRaise = this.raiseRemaining > 0;
      if (this.raisePause > 0) this.raisePause--;
      else if (!preparing) {
        if (manualRaise) {
          this.stop = 0;
          const step = Math.min(this.raiseRemaining, 1 / TIMING.raiseRepeat);
          this.rise += step;
          this.raiseRemaining = Math.max(0, this.raiseRemaining - step);
          if (this.mode === 'endless') this.riseAccumulator = this.speedWord;
        } else if (this.autoRise) {
          // Pixel processing is a separate tick; retain negative overshoot between pixels.
          if (this.riseAccumulator < 0) {
            this.riseAccumulator += 4096;
            this.rise += 1 / 16;
          } else this.riseAccumulator -= this.speedWord;
        }
        if (this.rise >= 1) {
          if (this.grid[HEIGHT - 1].some(Boolean)) {
            this.lost = true;
          } else {
            this.grid.pop();
            this.grid.unshift(this.nextRow);
            this.nextRow = this.makeRow();
            for (const block of this.garbage) block.y++;
            this.rise--;
            this.cursor.y = Math.min(ROWS - 2, this.cursor.y + 1);
            // Insert on pixel sixteen, then account for the native transition ticks.
            this.raisePause = manualRaise ? TIMING.raisePause : TIMING.autoPause;
          }
        }
      }
    }
    if (this.mode === 'story') {
      if (!resolving && !this.stop) {
        if (!this.atCeiling()) this.graceUsed = false;
        else if (this.graceUsed) this.lost = true;
        else { this.graceUsed = true; this.stop = this.graceTicks; }
      }
      // Display progress only; the shared timer and grace-used flag decide defeat.
      this.danger = this.graceUsed ? Math.max(1, this.graceTicks - this.stop) : 0;
    } else {
      if (!this.atCeiling()) this.danger = 0;
      else if (!resolving && !this.stop) this.danger++;
      if (this.danger >= this.graceTicks) this.lost = true;
    }
    // shortcut: the shared scan origin and garbage/fractional boundaries remain S11a-F2/F3.
    for (let x = scanPhase * 2; x < scanPhase * 2 + 2; x++) {
      const cell = this.grid[ROWS - 2][x];
      this.dangerFlags[x] = Boolean(cell && cell.phase !== 'clear');
    }
    this.admissionBlocked = this.clearHold > 0;
    this.clearHold = Math.max(0, this.clearHold - 1);
    this.landingHold = Math.max(0, this.landingHold - 1);
    return this.events;
  }
}

function potential(grid) {
  let score = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = grid[y][x];
      if (!canMatch(cell)) continue;
      if (canMatch(grid[y]?.[x + 1]) && grid[y][x + 1].kind === cell.kind) score += 2;
      if (canMatch(grid[y + 1]?.[x]) && grid[y + 1][x].kind === cell.kind) score += 2;
      if (canMatch(grid[y]?.[x + 2]) && grid[y][x + 2].kind === cell.kind) score++;
    }
  }
  return score;
}

function settlePreview(grid, first = 0, last = COLS - 1) {
  for (let x = first; x <= last; x++) for (let y = 1; y < HEIGHT; y++) {
    if (!canMatch(grid[y][x])) continue;
    let target = y;
    while (target > 0 && !grid[target - 1][x]) target--;
    if (target !== y) [grid[target][x], grid[y][x]] = [grid[y][x], null];
  }
}

export function chooseMove(board, chains = false, lastSwap = null) {
  let best = null;
  const baseline = potential(board.grid);
  const pressure = board.occupiedHeight() >= 10;
  for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      if (!board.canSwap(x, y) || board.grid[y][x]?.kind === board.grid[y][x + 1]?.kind) continue;
      const pair = [board.grid[y][x], board.grid[y][x + 1]];
      // CPU must let a swap/hover finish; player reversal remains available.
      if (pair.some(cell => cell && !canMatch(cell))) continue;
      if (lastSwap && x === lastSwap.x && y === lastSwap.y && pair[0] === lastSwap.left && pair[1] === lastSwap.right) continue;
      const grid = board.grid.map(row => [...row]);
      [grid[y][x], grid[y][x + 1]] = [grid[y][x + 1], grid[y][x]];
      // Predict gravity without modifying cells, timers or the panel generator.
      settlePreview(grid, x, x + 1);
      const matches = findMatches(grid);
      const distance = Math.abs(board.cursor.x - x) + Math.abs(board.cursor.y - y);
      let score = matches.length * 20 + potential(grid) - baseline - y * .03 - distance * .6;
      const garbage = new Set();
      for (const position of matches) {
        if (grid[position.y][position.x].chain) score += 16;
        if (pressure) score += position.y * 3;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const id = grid[position.y + dy]?.[position.x + dx]?.garbage;
          if (id) garbage.add(id);
        }
      }
      score += garbage.size * 35;
      if (chains && matches.length) {
        for (const { x: xx, y: yy } of matches) grid[yy][xx] = null;
        settlePreview(grid);
        score += findMatches(grid).length * 16;
      }
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  return best;
}

export const CPU_PROFILES = Object.freeze({
  easy: Object.freeze({ intervals: Object.freeze([18, 17, 16, 15, 14, 13, 12, 11, 10, 9]), chainsFrom: 9, raiseBelow: Object.freeze([5, 6, 7]) }),
  normal: Object.freeze({ intervals: Object.freeze([10, 9, 9, 8, 7, 7, 6, 6, 5, 5, 4]), chainsFrom: 4, raiseBelow: Object.freeze([6, 7, 8]) }),
  // shortcut: the last two Hard profiles share pacing; retune after playtesting if needed.
  hard: Object.freeze({ intervals: Object.freeze([7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2]), chainsFrom: 1, raiseBelow: Object.freeze([7, 8, 9]) }),
});

export class Cpu {
  constructor(interval = 9, { chains = false, raiseBelow = 7 } = {}) {
    this.interval = interval;
    this.target = null;
    this.cooldown = 0;
    this.raise = false;
    this.chains = chains;
    this.raiseBelow = raiseBelow;
    this.lastSwap = null;
  }

  step(board) {
    this.raise = !board.lost && !board.stop && !board.conversions.length && board.occupiedHeight() < this.raiseBelow;
    if (board.lost) return;
    if (--this.cooldown > 0) return;
    this.cooldown = this.interval;
    this.target = chooseMove(board, this.chains, this.lastSwap);
    if (!this.target) return;
    const { x, y } = this.target;
    if (board.cursor.y !== y) board.move(0, Math.sign(y - board.cursor.y));
    else if (board.cursor.x !== x) board.move(Math.sign(x - board.cursor.x), 0);
    else {
      if (board.swap()) this.lastSwap = { x, y, left: board.grid[y][x], right: board.grid[y][x + 1] };
      this.target = null;
    }
  }
}

export class Match {
  constructor(seed = Date.now(), difficulty = 'normal', encounter = 1, { cpu = true } = {}) {
    const timingDifficulty = difficulty === 'relaxed' ? 'easy' : difficulty;
    const rowState = { alternate: 0 };
    this.boards = [new Board(seed, { starter: cpu, difficulty: timingDifficulty, rowState }),
      new Board(seed ^ 0x9e3779b9, { difficulty: timingDifficulty, rowState })];
    // Independent encounter tuning, not a reconstruction of the native AI tables.
    const profile = CPU_PROFILES[this.boards[1].difficulty];
    const stage = Math.max(1, Math.min(profile.intervals.length, Math.trunc(encounter) || 1));
    this.cpu = cpu ? new Cpu(profile.intervals[stage - 1], { chains: stage >= profile.chainsFrom, raiseBelow: profile.raiseBelow[stage < 4 ? 0 : stage < 9 ? 1 : 2] }) : null;
    this.tick = 0;
    this.attacks = [];
    this.result = null;
  }

  step(input = {}, opponentInput = {}) {
    if (this.result) return [];
    this.tick++;
    const events = [];
    const inputs = [input, opponentInput];
    inputs.forEach((actions, player) => {
      if (player === 1 && this.cpu) return;
      if (actions.move && this.boards[player].move(...actions.move)) events.push({ type: 'move', player });
      if (actions.swap && this.boards[player].swap()) events.push({ type: 'swap', player });
    });
    this.cpu?.step(this.boards[1]);
    this.boards.forEach((board, player) => {
      const actions = player === 1 && this.cpu ? { raise: this.cpu.raise } : inputs[player];
      for (const event of board.step({ raise: actions.raise, raisePressed: actions.raisePressed, scanPhase: (this.tick - 1) % 3 })) {
        events.push({ ...event, player });
        if (event.type !== 'clear' && event.type !== 'chain-end') continue;
        // shortcut: Normal sampled anchors only; other profiles/projectile ranks remain S12a-F1.
        const calibrated = this.boards[player].mode === 'story' && this.boards[player].difficulty === 'normal';
        const delay = calibrated ? ATTACK_DELAYS[`${event.count}:${event.x}:${event.y}`] ?? 161 : 161;
        const origin = event.x === undefined ? board.banner || board.cursor : event;
        const cell = board.grid[origin.y]?.[origin.x];
        const attack = { due: this.tick + delay, born: this.tick, target: 1 - player, sender: player, height: 1, metal: false,
          origin: { x: origin.x, y: origin.y, rise: board.rise }, flightStart: this.tick + (event.type === 'clear' ? cell?.popAt || 0 : 0) };
        if (event.type === 'chain-end') {
          // shortcut: heights above four rows remain capped until chains beyond ×5 are measured.
          this.attacks.push({ ...attack, due: this.tick + 75, chain: true, width: 6, height: Math.min(4, event.chain - 1) });
          continue;
        }
        // shortcut: combos above 12 retain the prior six-wide attack until measured.
        if (event.count >= 4) for (const width of COMBO_WIDTHS[event.count] || [6]) {
          const pending = this.attacks.filter(item => item.sender === player && item.width === width && !item.metal && !item.chain && item.height === 1 && item.born < this.tick);
          // Sampled repeated width4/5 bursts have one extra preparation tick.
          const due = attack.due + (calibrated && pending.length && (width === 4 || width === 5) ? 1 : 0);
          for (const item of pending) item.due = due;
          this.attacks.push({ ...attack, due, width });
        }
        // shortcut: shock counts above 6 extrapolate the measured count-minus-two rule.
        for (let row = 2; row < event.shocks; row++) this.attacks.push({ ...attack, width: 6, metal: true });
      }
    });
    for (const target of [0, 1]) {
      const incoming = this.attacks.filter(item => item.target === target);
      const ordinary = incoming.filter(item => !item.metal && !item.chain && item.height === 1).sort((a, b) => a.width - b.width || a.born - b.born)[0];
      // shortcut: preserve due/FIFO ordering for unmeasured tall/metal/chain traffic (S12a-F2).
      const fallback = incoming.filter(item => item.metal || item.chain || item.height > 1).sort((a, b) => a.due - b.due)[0];
      const packet = fallback && (!ordinary || fallback.due < ordinary.due || (fallback.due === ordinary.due && incoming.indexOf(fallback) < incoming.indexOf(ordinary))) ? fallback : ordinary;
      if (packet && packet.due <= this.tick && !this.boards.some(board => board.lost) && this.boards[target].addGarbage(packet)) this.attacks.splice(this.attacks.indexOf(packet), 1);
    }
    const [player, cpu] = this.boards;
    if (player.lost || cpu.lost) {
      this.result = player.lost && cpu.lost ? 'draw' : player.lost ? 'loss' : 'win';
      this.attacks = [];
      this.boards.forEach(board => {
        board.chainDepth = 0;
        board.stopRequest = null;
        board.raiseQueued = false;
        board.raiseRemaining = 0;
        board.raiseDelay = null;
        board.raiseHeld = false;
        board.raisePause = 0;
      });
    }
    return events;
  }
}
