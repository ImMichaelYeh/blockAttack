import { COLS, ROWS, HEIGHT, isPanel, findMatches } from './engine.js';

export const CPU_LEVELS = Object.freeze(Array.from({ length: 10 }, (_, index) => {
  const level = index + 1;
  return Object.freeze({
    difficulty: level <= 3 ? 'easy' : level <= 7 ? 'normal' : 'hard',
    interval: 30 - index * 3,
    depth: 1 + Math.floor(index / 3),
    beam: 2 + index,
    comboWeight: 1 + index * 6,
    chainWeight: index * 8,
    travelWeight: 1.5 - index / 12,
    raiseBelow: 5 + Math.floor(index * 4 / 9),
    attackHeight: index,
  });
}));

const idle = cell => isPanel(cell) && cell.phase === 'idle';
const fieldKey = grid => grid.map(row => row.map(cell => !cell ? '.' : isPanel(cell) ? cell.kind : 'g').join('')).join('/');

function settle(grid) {
  for (let x = 0; x < COLS; x++) for (let y = 1; y < HEIGHT; y++) {
    if (!idle(grid[y][x])) continue;
    let target = y;
    while (target > 0 && !grid[target - 1][x]) target--;
    if (target !== y) [grid[target][x], grid[y][x]] = [grid[y][x], null];
  }
}

function setupPotential(grid) {
  let pairs = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cell = grid[y][x];
    if (!idle(cell)) continue;
    for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [0, 2]]) {
      const other = grid[y + dy]?.[x + dx];
      if (idle(other) && cell.kind === other.kind) pairs++;
    }
  }
  return pairs;
}

function preview(grid, x, y, profile, pressure) {
  grid = grid.map(row => [...row]);
  [grid[y][x], grid[y][x + 1]] = [grid[y][x + 1], grid[y][x]];
  settle(grid);
  let matches = findMatches(grid), reward = 0, cleared = 0, chain = 0;
  const garbage = new Set();
  // shortcut: forecast settled cascades, not timed mid-clear swaps or garbage conversion; extend after playtesting.
  while (matches.length) {
    chain++;
    cleared += matches.length;
    reward += matches.length * 20 + Math.max(0, matches.length - 3) * profile.comboWeight;
    if (chain > 1) reward += matches.length * profile.chainWeight;
    for (const position of matches) {
      if (pressure) reward += position.y * 4;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const id = grid[position.y + dy]?.[position.x + dx]?.garbage;
        if (id) garbage.add(id);
      }
    }
    for (const position of matches) grid[position.y][position.x] = null;
    settle(grid);
    matches = findMatches(grid);
  }
  return { grid, reward: reward + garbage.size * 60, cleared };
}

export function choosePlan(board, profile) {
  const initial = fieldKey(board.grid), pressure = board.occupiedHeight() >= 10;
  let frontier = [{ grid: board.grid, path: [], keys: [initial], reward: 0, cleared: 0, cost: 0, cursor: board.cursor }];
  let best = null;
  for (let depth = 0; depth < profile.depth; depth++) {
    const next = [];
    for (const state of frontier) for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) {
      const left = state.grid[y][x], right = state.grid[y][x + 1];
      if ((!left && !right) || left?.kind === right?.kind || (left && !idle(left)) || (right && !idle(right))) continue;
      if (depth === 0 && !board.canSwap(x, y)) continue;
      const result = preview(state.grid, x, y, profile, pressure), key = fieldKey(result.grid);
      if (state.keys.includes(key)) continue;
      const distance = Math.abs(state.cursor.x - x) + Math.abs(state.cursor.y - y);
      const cost = state.cost + (distance + 3) * profile.travelWeight;
      const candidate = {
        grid: result.grid, path: [...state.path, { x, y, before: state.keys.at(-1) }],
        keys: [...state.keys, key], reward: state.reward + result.reward,
        cleared: state.cleared + result.cleared, cost, cursor: { x, y },
      };
      candidate.score = candidate.reward - cost;
      candidate.rank = candidate.score + setupPotential(result.grid) * 2;
      if (candidate.cleared && (!best || candidate.score > best.score)) best = candidate;
      next.push(candidate);
    }
    next.sort((a, b) => b.rank - a.rank);
    frontier = next.slice(0, profile.beam);
  }
  return best && best.score > 0 ? best.path : [];
}

export class ComputerPlayer {
  constructor(level) {
    if (!Number.isInteger(level) || level < 1 || level > CPU_LEVELS.length) throw new RangeError('CPU level must be 1–10.');
    this.level = level;
    this.profile = CPU_LEVELS[level - 1];
    this.interval = this.profile.interval;
    this.cooldown = 0;
    this.plan = [];
    this.raise = false;
    this.waitKey = null;
  }

  step(board, incoming = false) {
    this.raise = false;
    if (board.lost) { this.plan = []; return; }
    const threatened = incoming || board.garbage.some(block => block.phase === 'fall');
    if (threatened) {
      // Releasing raise alone does not cancel the board's buffered row.
      board.raiseQueued = false;
      board.raiseRemaining = 0;
      board.raiseDelay = null;
    }
    const resolving = board.conversions.length || board.garbage.some(block => block.phase !== 'idle') ||
      board.grid.some(row => row.some(cell => isPanel(cell) && cell.phase !== 'idle'));
    if (resolving || findMatches(board.grid).length) return;
    const key = fieldKey(board.grid);
    if (this.plan.length && this.plan[0].before !== key) this.plan = [];
    const height = board.occupiedHeight(), aggressive = height < this.profile.attackHeight;
    this.raise = !threatened && (aggressive || !this.plan.length) &&
      (aggressive || !board.stop) && height < this.profile.raiseBelow;
    if (--this.cooldown > 0) return;
    this.cooldown = this.interval;
    if (!this.plan.length && key !== this.waitKey) {
      this.plan = choosePlan(board, this.profile);
      this.waitKey = this.plan.length ? null : key;
    }
    if (!this.plan.length) return;
    if (!aggressive) this.raise = false;
    const { x, y } = this.plan[0];
    if (!board.canSwap(x, y)) { this.plan = []; return; }
    if (board.cursor.y !== y) board.move(0, Math.sign(y - board.cursor.y));
    else if (board.cursor.x !== x) board.move(Math.sign(x - board.cursor.x), 0);
    else if (board.swap()) this.plan.shift();
  }
}
