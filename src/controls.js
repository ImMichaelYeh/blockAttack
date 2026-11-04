export const DEFAULT_BINDINGS = Object.freeze({ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', swap: 'Enter', raise: 'ShiftLeft' });
export const PLAYER_TWO_BINDINGS = Object.freeze({ up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', swap: 'ShiftRight', raise: 'Space' });
export const LABELS = Object.freeze({ up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', swap: 'Swap', raise: 'Raise stack' });
const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
export const keyLabel = code => ({ Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', Enter: 'Enter' }[code] || code.replace(/^Key|^Digit/, ''));
export const bindable = code => /^(Key[A-Z]|Digit[0-9]|Space|Enter|ShiftLeft|ShiftRight)$/.test(code);
export const normalizeKey = code => code === 'NumpadEnter' ? 'Enter' : code;
export function validBindings(value) {
  return value && typeof value === 'object' && Object.keys(DEFAULT_BINDINGS).every(action => bindable(value[action])) && new Set(Object.keys(DEFAULT_BINDINGS).map(action => value[action])).size === 6;
}

export function restoreBindings(value) {
  if (!validBindings(value)) return { ...DEFAULT_BINDINGS };
  const oldDefaults = ['Enter', 'KeyF'].map(swap => ({ ...DEFAULT_BINDINGS, swap, raise: 'KeyG' }));
  return oldDefaults.some(defaults => Object.keys(defaults).every(action => value[action] === defaults[action])) ? { ...DEFAULT_BINDINGS } : { ...value };
}

export class Controls {
  constructor(bindings = DEFAULT_BINDINGS, { arrows = true } = {}) { this.bindings = { ...bindings }; this.arrows = arrows; this.clear(); }
  clear() { this.held = new Set(); this.pressed = new Set(); this.moveTicks = 0; this.direction = null; }
  handles(code) { return Object.values(this.bindings).includes(code) || this.arrows && Object.values(ARROWS).includes(code); }
  down(code) { if (!this.held.has(code)) this.pressed.add(code); this.held.add(code); }
  up(code) { this.held.delete(code); }
  sample() {
    const active = action => [this.bindings[action], ...(this.arrows ? [ARROWS[action]] : [])].some(code => this.held.has(code));
    const direction = ['up', 'down', 'left', 'right'].find(active) || null;
    if (!direction || direction !== this.direction) this.moveTicks = 0;
    const move = direction && (this.moveTicks === 0 || this.moveTicks >= 10) ? { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[direction] : undefined;
    if (direction) this.moveTicks++;
    this.direction = direction;
    const input = { move, swap: this.pressed.has(this.bindings.swap), raise: active('raise'), raisePressed: this.pressed.has(this.bindings.raise) };
    this.pressed.clear();
    return input;
  }
}
