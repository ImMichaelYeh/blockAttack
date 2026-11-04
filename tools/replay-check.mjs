import { createHash } from 'node:crypto';

export function mechanicsReplay(engine, { seed, difficulty, stage, ticks, input }) {
  const match = new engine.Match(seed, difficulty, stage);
  const pilot = input === 'pilot' ? new engine.Cpu(3, { chains: true, raiseBelow: 8 }) : null;
  const snapshots = [], counts = {}, eventsHash = createHash('sha256');
  const snapshot = () => ({ tick: match.tick, hash: createHash('sha256').update(JSON.stringify(match)).digest('hex') });
  snapshots.push(snapshot());
  for (let frame = 0; frame < ticks && !match.result; frame++) {
    let actions = {};
    if (pilot) { pilot.step(match.boards[0]); actions = { raise: pilot.raise }; }
    else if (input === 'scripted') actions = {
      move: frame % 17 === 0 ? [frame % 34 ? 1 : -1, 0] : frame % 41 === 0 ? [0, frame % 82 ? 1 : -1] : undefined,
      swap: frame % 23 === 0 || frame % 23 === 2,
      raise: frame % 180 >= 120 && frame % 180 < 135,
      raisePressed: frame % 180 === 170,
    };
    const events = match.step(actions);
    eventsHash.update(JSON.stringify(events) + '\n');
    for (const event of events) counts[event.type] = (counts[event.type] || 0) + 1;
    if ([1, 11, 60, 120, 300, 900, 1800, 3600].includes(match.tick)) snapshots.push(snapshot());
  }
  if (snapshots.at(-1).tick !== match.tick) snapshots.push(snapshot());
  return { snapshots, eventsHash: eventsHash.digest('hex'), counts, result: match.result, scores: match.boards.map(board => board.score), chains: match.boards.map(board => board.bestChain) };
}
