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
  winHands?: number;
  tieHands?: number;
  loseHands?: number;
  table?: {
    win: number;
    tie: number;
    lose: number;
    equity: number;
    method: "exact" | "conditional_power" | "preflop_power";
    samples?: number;
    winHands?: number;
    tieHands?: number;
    loseHands?: number;
  };
  samples: number;
  categories: number[];
  bestHand: string;
  opponents: number;
  method: "exact" | "exact_multiway" | "preflop";
};
export type BoardVariant = {
  key: string;
  label: string;
  comboCount: number;
  strength: number[];
  suitCode?: string;
};
export type BoardCategory = {
  category: number;
  name: string;
  variants: BoardVariant[];
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

const MULTIWAY_EXACT_LIMIT = 25_000_000n;

function chooseBigInt(total: number, size: number) {
  if (size < 0 || size > total) return 0n;
  const selected = Math.min(size, total - size);
  let value = 1n;
  for (let index = 1; index <= selected; index++) {
    value = value * BigInt(total - selected + index) / BigInt(index);
  }
  return value;
}

function matchingCount(cards: number, hands: number) {
  if (hands * 2 > cards) return 0n;
  let value = 1n;
  for (let index = 0; index < hands; index++) value *= chooseBigInt(cards - index * 2, 2);
  for (let index = 2; index <= hands; index++) value /= BigInt(index);
  return value;
}

export function exactMultiwayDealCount(boardLength: number, opponents: number) {
  const missingBoard = 5 - boardLength;
  const cardsBeforeRunout = 50 - boardLength;
  return chooseBigInt(cardsBeforeRunout, missingBoard) * matchingCount(45, opponents);
}

type ClassifiedHand = { first: number; second: number; outcome: -1 | 0 | 1 };

export function independentOpponentApproximation(winPercent: number, tiePercent: number, opponents: number) {
  const winOne = winPercent / 100;
  const tieOne = tiePercent / 100;
  const unbeatenOne = winOne + tieOne;
  const win = winOne ** opponents;
  const unbeaten = unbeatenOne ** opponents;
  let equity = 0;
  let combinations = 1;
  for (let ties = 0; ties <= opponents; ties++) {
    if (ties > 0) combinations = combinations * (opponents - ties + 1) / ties;
    equity += combinations * tieOne ** ties * winOne ** (opponents - ties) / (ties + 1);
  }
  return { win: win * 100, tie: (unbeaten - win) * 100, lose: (1 - unbeaten) * 100, equity: equity * 100 };
}

async function enumerateTwoOpponents(
  hero: string[],
  board: string[],
  available: string[],
  runouts: string[][],
  onProgress?: (progress: number) => void,
) {
  let wins = 0;
  let ties = 0;
  let losses = 0;
  let equity = 0;

  for (let runoutIndex = 0; runoutIndex < runouts.length; runoutIndex++) {
    const runout = runouts[runoutIndex];
    const blocked = new Set(runout);
    const opponentDeck = available.filter((card) => !blocked.has(card));
    const finalBoard = [...board, ...runout];
    const heroScore = evaluate([...hero, ...finalBoard]);
    const hands: ClassifiedHand[] = [];
    for (let first = 0; first < opponentDeck.length - 1; first++) {
      for (let second = first + 1; second < opponentDeck.length; second++) {
        const comparison = compareScores(heroScore, evaluate([opponentDeck[first], opponentDeck[second], ...finalBoard]));
        hands.push({ first, second, outcome: comparison > 0 ? 1 : comparison < 0 ? -1 : 0 });
      }
    }
    for (let firstHand = 0; firstHand < hands.length - 1; firstHand++) {
      const first = hands[firstHand];
      for (let secondHand = firstHand + 1; secondHand < hands.length; secondHand++) {
        const second = hands[secondHand];
        if (first.first === second.first || first.first === second.second || first.second === second.first || first.second === second.second) continue;
        if (first.outcome < 0 || second.outcome < 0) losses++;
        else if (first.outcome === 0 || second.outcome === 0) {
          ties++;
          equity += 1 / (1 + Number(first.outcome === 0) + Number(second.outcome === 0));
        } else {
          wins++;
          equity++;
        }
      }
    }
    onProgress?.(.25 + .75 * (runoutIndex + 1) / runouts.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const samples = wins + ties + losses;
  const percent = (value: number) => value / samples * 100;
  return {
    win: percent(wins), tie: percent(ties), lose: percent(losses), equity: percent(equity),
    samples, winHands: wins, tieHands: ties, loseHands: losses, method: "exact" as const,
  };
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
  const dealCount = exactMultiwayDealCount(board.length, opponents);
  const willEnumerateTwoOpponents = opponents === 2 && dealCount <= MULTIWAY_EXACT_LIMIT;
  const outcomes = [0, 0, 0];
  const categories = Array(9).fill(0) as number[];
  const projected = { win: 0, tie: 0, lose: 0, equity: 0 };
  let equity = 0;

  for (let runoutIndex = 0; runoutIndex < runouts.length; runoutIndex++) {
    const runout = runouts[runoutIndex];
    const blocked = new Set(runout);
    const opponentDeck = available.filter((card) => !blocked.has(card));
    const finalBoard = [...board, ...runout];
    const heroScore = evaluate([...hero, ...finalBoard]);
    const runoutOutcomes = [0, 0, 0];
    for (let first = 0; first < opponentDeck.length - 1; first++) {
      for (let second = first + 1; second < opponentDeck.length; second++) {
        const opponentScore = evaluate([opponentDeck[first], opponentDeck[second], ...finalBoard]);
        const comparison = compareScores(heroScore, opponentScore);
        categories[heroScore[0]]++;
        if (comparison > 0) { outcomes[0]++; runoutOutcomes[0]++; equity += 1; }
        else if (comparison === 0) { outcomes[1]++; runoutOutcomes[1]++; equity += .5; }
        else { outcomes[2]++; runoutOutcomes[2]++; }
      }
    }
    if (opponents > 1) {
      const runoutHands = runoutOutcomes[0] + runoutOutcomes[1] + runoutOutcomes[2];
      const runoutProjection = independentOpponentApproximation(
        runoutOutcomes[0] / runoutHands * 100,
        runoutOutcomes[1] / runoutHands * 100,
        opponents,
      );
      projected.win += runoutProjection.win / runouts.length;
      projected.tie += runoutProjection.tie / runouts.length;
      projected.lose += runoutProjection.lose / runouts.length;
      projected.equity += runoutProjection.equity / runouts.length;
    }
    if (runoutIndex % 12 === 0 || runoutIndex === runouts.length - 1) {
      onProgress?.((runoutIndex + 1) / runouts.length * (willEnumerateTwoOpponents ? .25 : 1));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const samples = outcomes[0] + outcomes[1] + outcomes[2];
  const percent = (value: number) => value / samples * 100;
  const topCategory = categories.reduce((best, count, index) => count > categories[best] ? index : best, 0);
  const base = {
    win: percent(outcomes[0]), tie: percent(outcomes[1]), lose: percent(outcomes[2]), equity: percent(equity), samples,
    winHands: outcomes[0], tieHands: outcomes[1], loseHands: outcomes[2],
    categories: categories.map(percent), bestHand: HAND_NAMES[topCategory],
  };
  if (opponents === 1) return { ...base, opponents, method: "exact" };
  if (willEnumerateTwoOpponents) {
    const table = await enumerateTwoOpponents(hero, board, available, runouts, onProgress);
    return { ...base, table, opponents, method: "exact_multiway" };
  }
  return {
    ...base,
    table: { ...projected, method: "conditional_power" },
    opponents,
    method: "exact",
  };
}

const CATALOGUE_CATEGORIES = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const rankLabel = (value: number) => RANKS[value - 2] ?? String(value);

function flushSuit(cards: string[]) {
  return SUITS.find((suit) => cards.filter((card) => card.endsWith(suit.code)).length >= 5);
}

function straightWindow(high: number) {
  return high === 5 ? [14, 2, 3, 4, 5] : Array.from({ length: 5 }, (_, index) => high - 4 + index);
}

function fullHouseRequirement(score: Score, board: string[]): Omit<BoardVariant, "comboCount"> {
  const boardCounts = new Map<number, number>();
  for (const card of board) boardCounts.set(valueOf(card), (boardCounts.get(valueOf(card)) ?? 0) + 1);
  const required: number[] = [];
  const targets: Array<[number, number]> = [[score[1], 3], [score[2], 2]];
  for (const [rank, target] of targets) {
    for (let count = boardCounts.get(rank) ?? 0; count < target; count++) required.push(rank);
  }
  const label = required.length === 0
    ? "公共牌已成葫芦"
    : required.length === 1
      ? rankLabel(required[0])
      : required[0] === required[1]
        ? `对${rankLabel(required[0])}`
        : required.map(rankLabel).join(" ");
  return { key: `${score[1]}-${score[2]}-${label}`, label, strength: [score[1], score[2]] };
}

function quadsRequirement(score: Score, board: string[]): Omit<BoardVariant, "comboCount"> {
  const countOnBoard = board.filter((card) => valueOf(card) === score[1]).length;
  const needed = Math.max(0, 4 - countOnBoard);
  const label = needed === 0 ? "公共牌已成四条" : needed === 1 ? rankLabel(score[1]) : `对${rankLabel(score[1])}`;
  return { key: `${score[1]}-${label}`, label, strength: [score[1]] };
}

function straightRequirement(score: Score, board: string[]): Omit<BoardVariant, "comboCount"> | null {
  const window = straightWindow(score[1]);
  const boardValues = new Set(board.map(valueOf));
  const missing = window.filter((value) => !boardValues.has(value));
  if (missing.length === 2 && window.indexOf(missing[1]) - window.indexOf(missing[0]) !== 1) return null;
  const label = missing.length ? missing.map(rankLabel).join("") : "公共牌已成顺子";
  return { key: `${score[1]}-${label}`, label, strength: [score[1]] };
}

function tripsRequirement(score: Score, board: string[]): Omit<BoardVariant, "comboCount"> {
  const boardCount = board.filter((card) => valueOf(card) === score[1]).length;
  const needed = Math.max(0, 3 - boardCount);
  const label = needed === 0 ? "公共牌已成三条" : needed === 1 ? rankLabel(score[1]) : `对${rankLabel(score[1])}`;
  return { key: `${score[1]}-${label}`, label, strength: [score[1]] };
}

function twoPairRequirement(score: Score, board: string[]): Omit<BoardVariant, "comboCount"> {
  const boardCounts = new Map<number, number>();
  for (const card of board) boardCounts.set(valueOf(card), (boardCounts.get(valueOf(card)) ?? 0) + 1);
  const required: number[] = [];
  for (const rank of [score[1], score[2]]) {
    for (let count = boardCounts.get(rank) ?? 0; count < 2; count++) required.push(rank);
  }
  const label = required.length === 0
    ? "公共牌已成两对"
    : required.length === 1
      ? rankLabel(required[0])
      : required[0] === required[1]
        ? `对${rankLabel(required[0])}`
        : required.map(rankLabel).join(" ");
  return { key: `${score[1]}-${score[2]}-${label}`, label, strength: [score[1], score[2]] };
}

function pairRequirement(score: Score, board: string[]): Omit<BoardVariant, "comboCount"> {
  const countOnBoard = board.filter((card) => valueOf(card) === score[1]).length;
  const label = countOnBoard === 0
    ? `对${rankLabel(score[1])}`
    : countOnBoard === 1
      ? rankLabel(score[1])
      : `公共牌已有对${rankLabel(score[1])}`;
  return { key: `${score[1]}-${label}`, label, strength: [score[1]] };
}

function pairedBoardTwoPairRequirements(board: string[], excluded: string[]): BoardVariant[] | null {
  const boardCounts = new Map<number, number>();
  for (const card of board) boardCounts.set(valueOf(card), (boardCounts.get(valueOf(card)) ?? 0) + 1);
  const boardPairs = [...boardCounts.entries()].filter(([, count]) => count === 2).map(([rank]) => rank);
  if (boardPairs.length !== 1) return null;
  const pairRank = boardPairs[0];
  const used = new Set([...board, ...excluded]);
  const available = DECK.filter((card) => !used.has(card));
  const variants: BoardVariant[] = [];
  for (let rank = 14; rank >= 2; rank--) {
    if (rank === pairRank) continue;
    const countOnBoard = boardCounts.get(rank) ?? 0;
    const remaining = available.filter((card) => valueOf(card) === rank).length;
    if (countOnBoard === 0 && remaining >= 2) {
      variants.push({ key: `pair-${rank}`, label: `对${rankLabel(rank)}`, comboCount: remaining * (remaining - 1) / 2, strength: [Math.max(rank, pairRank), Math.min(rank, pairRank)] });
    } else if (countOnBoard === 1 && remaining >= 1) {
      variants.push({ key: `match-${rank}`, label: rankLabel(rank), comboCount: remaining * (available.length - remaining), strength: [Math.max(rank, pairRank), Math.min(rank, pairRank)] });
    }
  }
  return variants.sort((a, b) => compareScores(b.strength, a.strength));
}

function variantDetails(score: Score, holeCards: [string, string], board: string[]): Omit<BoardVariant, "comboCount"> | null {
  const category = score[0];
  if (category === 8) {
    const allCards = [...holeCards, ...board];
    const suit = flushSuit(allCards)!;
    const window = straightWindow(score[1]);
    const suitedBoardValues = new Set(board.filter((card) => card.endsWith(suit.code)).map(valueOf));
    const missing = window.filter((value) => !suitedBoardValues.has(value));
    if (missing.length === 2 && window.indexOf(missing[1]) - window.indexOf(missing[0]) !== 1) return null;
    const label = missing.length ? missing.map((value) => `${rankLabel(value)}${suit.symbol}`).join(" ") : `${suit.symbol} 公共牌已成牌`;
    return { key: `${label}-${suit.code}`, label, strength: [score[1], -SUITS.findIndex((item) => item.code === suit.code)], suitCode: suit.code };
  }
  if (category === 7) return quadsRequirement(score, board);
  if (category === 6) return fullHouseRequirement(score, board);
  if (category === 5) {
    const suit = flushSuit([...holeCards, ...board])!;
    return { key: suit.code, label: `${suit.symbol} ${suit.name}同花`, strength: [-SUITS.findIndex((item) => item.code === suit.code)], suitCode: suit.code };
  }
  if (category === 4) return straightRequirement(score, board);
  if (category === 3) return tripsRequirement(score, board);
  if (category === 2) return twoPairRequirement(score, board);
  return pairRequirement(score, board);
}

export function boardCategoryCatalogue(board: string[], excluded: string[] = []): BoardCategory[] {
  const catalogue = CATALOGUE_CATEGORIES.map((category) => ({ category, name: HAND_NAMES[category], variants: [] as BoardVariant[] }));
  if (board.length < 3) return catalogue;
  const used = new Set([...board, ...excluded]);
  const available = DECK.filter((card) => !used.has(card));
  const groups = new Map<number, Map<string, BoardVariant>>(CATALOGUE_CATEGORIES.map((category) => [category, new Map()]));
  for (let first = 0; first < available.length - 1; first++) {
    for (let second = first + 1; second < available.length; second++) {
      const cards: [string, string] = [available[first], available[second]];
      const score = evaluate([...cards, ...board]);
      const categoryGroups = groups.get(score[0]);
      if (!categoryGroups) continue;
      const details = variantDetails(score, cards, board);
      if (!details) continue;
      const existing = categoryGroups.get(details.key);
      if (existing) existing.comboCount++;
      else categoryGroups.set(details.key, { ...details, comboCount: 1 });
    }
  }
  for (const section of catalogue) {
    const pairedBoardVariants = section.category === 2 ? pairedBoardTwoPairRequirements(board, excluded) : null;
    section.variants = pairedBoardVariants ?? [...groups.get(section.category)!.values()].sort((a, b) => compareScores(b.strength, a.strength));
  }
  return catalogue;
}

export function cardParts(card: string) {
  const rank = card.slice(0, -1);
  const suit = SUITS.find((item) => item.code === card.slice(-1))!;
  return { rank, ...suit };
}
