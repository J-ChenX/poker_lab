export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const SUITS = [
  { code: "s", symbol: "♠", name: "黑桃" },
  { code: "h", symbol: "♥", name: "红桃" },
  { code: "d", symbol: "♦", name: "方块" },
  { code: "c", symbol: "♣", name: "梅花" },
] as const;
export const DECK = SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit.code}`));
export const HAND_NAMES = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"];

type Score = number[];
export type SimulationResult = {
  win: number;
  tie: number;
  lose: number;
  equity: number;
  samples: number;
  exact: boolean;
  categories: number[];
  bestHand: string;
};

const valueOf = (card: string) => RANKS.indexOf(card.slice(0, -1) as (typeof RANKS)[number]) + 2;

function evaluateFive(cards: string[]): Score {
  const values = cards.map(valueOf).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.slice(-1) === cards[0].slice(-1));
  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique.join(",") === "14,5,4,3,2") straightHigh = 5;
  }
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map((g) => g[0]).sort((a, b) => b - a)];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map((g) => g[0]).sort((a, b) => b - a)];
  return [0, ...values];
}

export function evaluate(cards: string[]): Score {
  let best: Score = [-1];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const score = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compare(score, best) > 0) best = score;
          }
  return best;
}

function compare(a: Score, b: Score) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function summarize(outcomes: number[], equity: number, categories: number[], exact: boolean): SimulationResult {
  const samples = outcomes[0] + outcomes[1] + outcomes[2];
  const pct = (n: number) => (n / samples) * 100;
  const topCategory = categories.reduce((best, count, index) => count > categories[best] ? index : best, 0);
  return {
    win: pct(outcomes[0]), tie: pct(outcomes[1]), lose: pct(outcomes[2]), equity: pct(equity),
    samples, exact, categories: categories.map(pct), bestHand: HAND_NAMES[topCategory],
  };
}

function record(heroScore: Score, opponentScores: Score[], outcomes: number[], categories: number[]) {
  const comparisons = opponentScores.map((score) => compare(heroScore, score));
  const category = heroScore[0];
  categories[category]++;
  if (comparisons.some((result) => result < 0)) { outcomes[2]++; return 0; }
  const ties = comparisons.filter((result) => result === 0).length;
  if (ties) { outcomes[1]++; return 1 / (ties + 1); }
  outcomes[0]++;
  return 1;
}

export function simulate(hero: string[], board: string[], opponents: number, iterations: number): SimulationResult {
  const used = new Set([...hero, ...board]);
  const available = DECK.filter((card) => !used.has(card));
  const boardNeeded = 5 - board.length;
  const outcomes = [0, 0, 0];
  const categories = Array(9).fill(0);
  let equity = 0;

  // River/turn heads-up spots are small enough to enumerate exactly.
  if (opponents === 1 && boardNeeded <= 1) {
    if (boardNeeded === 0) {
      const heroScore = evaluate([...hero, ...board]);
      for (let i = 0; i < available.length - 1; i++) for (let j = i + 1; j < available.length; j++)
        equity += record(heroScore, [evaluate([available[i], available[j], ...board])], outcomes, categories);
    } else {
      for (let r = 0; r < available.length; r++) {
        const finalBoard = [...board, available[r]];
        const heroScore = evaluate([...hero, ...finalBoard]);
        for (let i = 0; i < available.length - 1; i++) {
          if (i === r) continue;
          for (let j = i + 1; j < available.length; j++) {
            if (j === r) continue;
            equity += record(heroScore, [evaluate([available[i], available[j], ...finalBoard])], outcomes, categories);
          }
        }
      }
    }
    return summarize(outcomes, equity, categories, true);
  }

  const needed = boardNeeded + opponents * 2;
  for (let run = 0; run < iterations; run++) {
    const pool = [...available];
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const finalBoard = [...board, ...pool.slice(0, boardNeeded)];
    const heroScore = evaluate([...hero, ...finalBoard]);
    const opponentScores = Array.from({ length: opponents }, (_, index) => {
      const start = boardNeeded + index * 2;
      return evaluate([pool[start], pool[start + 1], ...finalBoard]);
    });
    equity += record(heroScore, opponentScores, outcomes, categories);
  }
  return summarize(outcomes, equity, categories, false);
}

export function cardParts(card: string) {
  const rank = card.slice(0, -1);
  const suit = SUITS.find((item) => item.code === card.slice(-1))!;
  return { rank, ...suit };
}
