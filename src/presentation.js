export const INTRO_TICKS = 72;
export const RESULT_TICKS = 150;
export const SCENE_WIDTH = 256;
export const SCENE_HEIGHT = 224;

export function boardInDanger(board) {
  return board.occupiedHeight(false) >= 10;
}

export function sceneScale(width, height) {
  return Math.max(1, Math.floor(Math.min((width - 40) / SCENE_WIDTH, (height - 124) / SCENE_HEIGHT)));
}

export function incomingPackets(match, player) {
  return [
    ...match.attacks.filter(packet => packet.target === player),
    ...match.boards[player].garbage.filter(block => block.incoming && block.phase !== 'convert'),
  ];
}

export function incomingPreview(match, player, reduced = false) {
  return match.attacks.filter(packet => packet.target === player &&
    (reduced || !Number.isFinite(packet.flightStart) || match.tick >= packet.flightStart + 36));
}

export function comboCard(board, reduced = false) {
  const banner = board.banner;
  if (!banner || banner.life <= 0) return null;
  const text = banner.chain > 1 ? `X${banner.chain}` : banner.shock ? '!' : String(banner.count);
  const width = Math.max(16, text.length * 6 + 4);
  const float = reduced ? 0 : Math.floor((100 - banner.life) * .15);
  return {
    text, width, height: 14,
    x: Math.max(1, Math.min(94 - width, (banner.x + 1) * 16 - width / 2)),
    y: Math.max(1, Math.min(176, Math.round((11 - banner.y - board.rise) * 16) - 9 - float)),
  };
}

export function resultPose(result, player) {
  return !result ? 'idle' : result === 'draw' ? 'hit' : (result === 'win') === (player === 0) ? 'win' : 'lose';
}

export function resultCellOffset(result, player, age, column, reduced) {
  if (!result || reduced || resultPose(result, player) === 'win') return 0;
  const fall = Math.max(0, age - 30 - column * 5);
  return Math.min(700, fall * fall * .15);
}

export function victoryStarOffset(age, reduced) {
  if (reduced || age < 18 || age >= 126) return 0;
  const phase = (age - 18) / 36;
  return -Math.round(Math.abs(Math.sin(phase * Math.PI)) * 12 * (1 - phase / 3));
}

export function victoryStarSlots(session, result) {
  const local = session.mode === 'local', winner = result === 'win' ? 0 : result === 'loss' ? 1 : null;
  return Array.from({ length: local ? 4 : 2 }, (_, index) => {
    const player = index % 2, slot = Math.floor(index / 2);
    return {
      player, slot, x: 110 + player * 20, y: 188 + slot * 18,
      filled: local ? slot < session.stars[player] : winner === player,
      awarded: winner === player && (!local || slot === session.stars[player] - 1),
    };
  });
}
