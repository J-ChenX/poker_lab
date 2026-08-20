export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const SUITS = [
  { code: "s", symbol: "♠", name: "黑桃" },
  { code: "h", symbol: "♥", name: "红桃" },
  { code: "d", symbol: "♦", name: "方块" },
  { code: "c", symbol: "♣", name: "梅花" },
] as const;
export const DECK = SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit.code}`));
export const HAND_NAMES = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"];

export type Score = number[];
export type ExactResult = {
  win: number;
  tie: number;
  lose: number;
  equity: number;
  samples: number;
  categories: number[];
  bestHand: string;
  opponents: number;
  method: "exact" | "combination" | "preflop" | "preflop_combination";
};
export type RankedBoardGroup = {
  handName: string;
  score: Score;
  comboCount: number;
  patterns: Array<{ ranks: [string, string]; comboCount: number }>;
  flushSuits: string[];
};

const valueOf = (card: string) => RANKS.indexOf(card.slice(0, -1) as (typeof RANKS)[number]) + 2;

function straightHigh(values: number[]) {
  const present = new Set(values);
  if (present.has(14)) present.add(1);
  for (let high = 14; high >= 5; high--) {
    let found = true;
    for (let offset = 0; offset < 5; offset++) if (!present.has(high - offset)) found = false;
    if (found) return high;
  }
  return 0;
}

// Direct 5–7 card evaluator. It derives the best category without generating
// every five-card subset, which keeps full flop enumeration practical.
export function evaluate(cards: string[]): Score {
  const counts = Array(15).fill(0) as number[];
  const suitValues: Record<string, number[]> = { s: [], h: [], d: [], c: [] };
  for (const card of cards) {
    const value = valueOf(card);
    counts[value]++;
    suitValues[card.slice(-1)].push(value);
  }
  const ranks = Array.from({ length: 13 }, (_, index) => index + 2).filter((rank) => counts[rank]).sort((a, b) => b - a);
  const flushRanks = Object.values(suitValues).find((values) => values.length >= 5)?.sort((a, b) => b - a);
  if (flushRanks) {
    const high = straightHigh(flushRanks);
    if (high) return [8, high];
  }
  const quads = ranks.filter((rank) => counts[rank] === 4);
  if (quads.length) return [7, quads[0], ranks.find((rank) => rank !== quads[0])!];
  const trips = ranks.filter((rank) => counts[rank] === 3);
  const pairs = ranks.filter((rank) => counts[rank] >= 2);
  if (trips.length && pairs.some((rank) => rank !== trips[0])) return [6, trips[0], pairs.find((rank) => rank !== trips[0])!];
  if (flushRanks) return [5, ...flushRanks.slice(0, 5)];
  const straight = straightHigh(ranks);
  if (straight) return [4, straight];
  if (trips.length) return [3, trips[0], ...ranks.filter((rank) => rank !== trips[0]).slice(0, 2)];
  if (pairs.length >= 2) {
    const [highPair, lowPair] = pairs;
    return [2, highPair, lowPair, ranks.find((rank) => rank !== highPair && rank !== lowPair)!];
  }
  if (pairs.length === 1) return [1, pairs[0], ...ranks.filter((rank) => rank !== pairs[0]).slice(0, 3)];
  return [0, ...ranks.slice(0, 5)];
}

export function compareScores(a: Score, b: Score) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function combinations(cards: string[], size: number) {
  if (size === 0) return [[]] as string[][];
  if (size === 1) return cards.map((card) => [card]);
  const result: string[][] = [];
  for (let first = 0; first < cards.length - 1; first++)
    for (let second = first + 1; second < cards.length; second++) result.push([cards[first], cards[second]]);
  return result;
}

export async function enumerateExact(
  hero: string[],
  board: string[],
  opponents = 1,
  onProgress?: (progress: number) => void,
): Promise<ExactResult> {
  if (hero.length !== 2 || board.length < 3 || board.length > 5) throw new Error("精确枚举需要两张底牌和至少三张公共牌");
  const used = new Set([...hero, ...board]);
  const available = DECK.filter((card) => !used.has(card));
  const missing = 5 - board.length;
  const runouts = combinations(available, missing);
  const outcomes = [0, 0, 0];
  const categories = Array(9).fill(0) as number[];
  let equity = 0;

  for (let runoutIndex = 0; runoutIndex < runouts.length; runoutIndex++) {
    const runout = runouts[runoutIndex];
    const blocked = new Set(runout);
    const opponentDeck = available.filter((card) => !blocked.has(card));
    const finalBoard = [...board, ...runout];
    const heroScore = evaluate([...hero, ...finalBoard]);
    for (let first = 0; first < opponentDeck.length - 1; first++) {
      for (let second = first + 1; second < opponentDeck.length; second++) {
        const opponentScore = evaluate([opponentDeck[first], opponentDeck[second], ...finalBoard]);
        const comparison = compareScores(heroScore, opponentScore);
        categories[heroScore[0]]++;
        if (comparison > 0) { outcomes[0]++; equity += 1; }
        else if (comparison === 0) { outcomes[1]++; equity += .5; }
        else outcomes[2]++;
      }
    }
    if (runoutIndex % 12 === 0 || runoutIndex === runouts.length - 1) {
      onProgress?.((runoutIndex + 1) / runouts.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const samples = outcomes[0] + outcomes[1] + outcomes[2];
  const percent = (value: number) => value / samples * 100;
  const topCategory = categories.reduce((best, count, index) => count > categories[best] ? index : best, 0);
  const base = {
    win: percent(outcomes[0]), tie: percent(outcomes[1]), lose: percent(outcomes[2]), equity: percent(equity), samples,
    categories: categories.map(percent), bestHand: HAND_NAMES[topCategory],
  };
  if (opponents === 1) return { ...base, opponents, method: "exact" };

  // Deterministic multiway projection from the exhaustive one-opponent table.
  // This closed form has no sampling noise; it treats opponent hand outcomes as
  // independent after the known-card removal performed above.
  const winOne = base.win / 100;
  const tieOne = base.tie / 100;
  const unbeatenOne = winOne + tieOne;
  const winAll = winOne ** opponents;
  const unbeatenAll = unbeatenOne ** opponents;
  const tieAny = unbeatenAll - winAll;
  const loseAny = 1 - unbeatenAll;
  let multiwayEquity = 0;
  const choose = (n: number, k: number) => {
    let value = 1;
    for (let index = 1; index <= k; index++) value = value * (n - index + 1) / index;
    return value;
  };
  for (let ties = 0; ties <= opponents; ties++) {
    multiwayEquity += choose(opponents, ties) * tieOne ** ties * winOne ** (opponents - ties) / (ties + 1);
  }
  return {
    ...base,
    win: winAll * 100,
    tie: tieAny * 100,
    lose: loseAny * 100,
    equity: multiwayEquity * 100,
    opponents,
    method: "combination",
  };
}

export function topBoardGroups(board: string[], excluded: string[] = []): RankedBoardGroup[] {
  if (board.length < 3) return [];
  const used = new Set([...board, ...excluded]);
  const available = DECK.filter((card) => !used.has(card));
  const hands: Array<{ cards: [string, string]; score: Score }> = [];
  for (let first = 0; first < available.length - 1; first++) {
    for (let second = first + 1; second < available.length; second++) {
      const cards: [string, string] = [available[first], available[second]];
      const score = evaluate([...cards, ...board]);
      hands.push({ cards, score });
    }
  }
  hands.sort((a, b) => compareScores(b.score, a.score) || valueOf(b.cards[0]) - valueOf(a.cards[0]) || valueOf(b.cards[1]) - valueOf(a.cards[1]));
  const groups = new Map<string, RankedBoardGroup>();
  for (const hand of hands) {
    const scoreKey = hand.score.join("-");
    let group = groups.get(scoreKey);
    if (!group) {
      group = { score: hand.score, handName: HAND_NAMES[hand.score[0]], comboCount: 0, patterns: [], flushSuits: [] };
      groups.set(scoreKey, group);
    }
    group.comboCount++;
    if (hand.score[0] === 5 || hand.score[0] === 8) {
      const allCards = [...hand.cards, ...board];
      const flushSuit = SUITS.find((suit) => allCards.filter((card) => card.endsWith(suit.code)).length >= 5)?.code;
      if (flushSuit && !group.flushSuits.includes(flushSuit)) group.flushSuits.push(flushSuit);
    }
    const ranks = hand.cards.map((card) => card.slice(0, -1)).sort((a, b) => RANKS.indexOf(b as (typeof RANKS)[number]) - RANKS.indexOf(a as (typeof RANKS)[number])) as [string, string];
    const patternKey = ranks.join("-");
    const pattern = group.patterns.find((item) => item.ranks.join("-") === patternKey);
    if (pattern) pattern.comboCount++;
    else group.patterns.push({ ranks, comboCount: 1 });
  }
  return [...groups.values()].slice(0, 10);
}

export function cardParts(card: string) {
  const rank = card.slice(0, -1);
  const suit = SUITS.find((item) => item.code === card.slice(-1))!;
  return { rank, ...suit };
}
