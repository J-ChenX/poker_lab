export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const REVIVE_COSTS: Record<number, number[]> = {
  5: [11, 14, 18, 19, 21, 22, 23],
  6: [11, 14, 18, 19, 21, 22, 23],
  7: [12, 16, 20, 22, 24, 26, 27],
  8: [12, 16, 20, 22, 24, 26, 27],
  9: [14, 18, 23, 25, 28, 30, 31],
  10: [14, 18, 23, 25, 28, 30, 31],
  11: [15, 19, 25, 27, 31, 32, 34],
  12: [15, 19, 25, 27, 31, 32, 34],
};

export const BLIND_LEVELS = [
  { level: 1, small: 5, big: 10, chips: 2_000, exchange: null },
  { level: 2, small: 10, big: 20, chips: 3_000, exchange: "收回 5 面额筹码" },
  { level: 3, small: 20, big: 40, chips: 4_500, exchange: null },
  { level: 4, small: 30, big: 60, chips: 5_000, exchange: null },
  { level: 5, small: 50, big: 100, chips: 6_000, exchange: null },
  { level: 6, small: 70, big: 140, chips: 6_500, exchange: null },
  { level: 7, small: 100, big: 200, chips: 7_000, exchange: "收回 10、20 面额筹码" },
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
  if (playerCount < 5 || level < 1 || level > 7) return 0;
  return REVIVE_COSTS[playerCount]?.[level - 1] ?? 0;
}

export function orbitCount(activePlayers: number) {
  return Math.max(1, Math.floor(10 / activePlayers));
}
