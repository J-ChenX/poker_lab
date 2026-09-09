export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const INITIAL_CHIPS = 2_000;

// 从初始筹码数开始，每升一级增加 500，最多为初始筹码的两倍。
export const BLIND_LEVELS = [
  { level: 1, small: 5, big: 10, chips: 2_000, exchange: null },
  { level: 2, small: 10, big: 20, chips: 2_500, exchange: "收回 5 面额筹码" },
  { level: 3, small: 20, big: 40, chips: 3_000, exchange: null },
  { level: 4, small: 30, big: 60, chips: 3_500, exchange: null },
  { level: 5, small: 50, big: 100, chips: 4_000, exchange: null },
  { level: 6, small: 70, big: 140, chips: 4_000, exchange: null },
  { level: 7, small: 100, big: 200, chips: 4_000, exchange: "收回 10、20 面额筹码" },
  { level: 8, small: 150, big: 300, chips: null, exchange: null },
  { level: 9, small: 200, big: 400, chips: null, exchange: null },
  { level: 10, small: 300, big: 600, chips: null, exchange: null },
] as const;

export function placementScore(playerCount: number, rank: number) {
  if (rank < 1 || rank > Math.ceil(playerCount / 2)) return 0;
  const formulas = [
    4 * playerCount + 4,
    3 * playerCount - 1,
    2 * playerCount - 4,
    playerCount - 2,
    playerCount - 4,
    playerCount - 6,
  ];
  return Math.max(0, formulas[rank - 1] ?? 0);
}

export function scoringPlaceCount(playerCount: number) {
  return Math.min(6, Math.ceil(playerCount / 2));
}

export function knockoutBase(playerCount: number) {
  return Math.ceil(playerCount / 4) + 1;
}

export function knockoutShare(playerCount: number, winnerCount: number) {
  return Math.ceil(knockoutBase(playerCount) / Math.max(1, winnerCount));
}

export function reviveCost(playerCount: number, level: number) {
  if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > MAX_PLAYERS) return 0;
  const chips = BLIND_LEVELS[level - 1]?.chips;
  if (!chips) return 0;
  const pairStart = playerCount % 2 === 0 ? playerCount - 1 : playerCount;
  const costFor = (count: number) => {
    let prizePool = 0;
    for (let rank = 1; rank <= scoringPlaceCount(count); rank++) prizePool += placementScore(count, rank);
    return Math.ceil(prizePool * chips / (INITIAL_CHIPS * count + chips)) + knockoutBase(count);
  };
  return Math.max(costFor(pairStart), costFor(pairStart + 1));
}

export function orbitCount(activePlayers: number) {
  return Math.max(1, Math.floor(10 / activePlayers));
}
