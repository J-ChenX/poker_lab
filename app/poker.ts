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
    method: "exact" | "third_order_compensation" | "preflop_compensation";
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

const chooseTwo = (value: number) => value * (value - 1) / 2;
const chooseThree = (value: number) => value * (value - 1) * (value - 2) / 6;

function twoEdgeMatchings(edges: number, degrees: number[]) {
  return chooseTwo(edges) - degrees.reduce((sum, degree) => sum + chooseTwo(degree), 0);
}

function threeEdgeMatchings(edges: Array<readonly [number, number]>, degrees: number[], adjacency: Uint8Array) {
  const edgeCount = edges.length;
  if (edgeCount < 3) return 0;
  const cardCount = degrees.length;
  const adjacentPairs = degrees.reduce((sum, degree) => sum + chooseTwo(degree), 0);
  const stars = degrees.reduce((sum, degree) => sum + chooseThree(degree), 0);
  let linkedWedges = 0;
  let triangles = 0;
  for (const [first, second] of edges) {
    linkedWedges += (degrees[first] - 1) * (degrees[second] - 1);
    for (let third = second + 1; third < cardCount; third++) {
      if (adjacency[first * cardCount + third] && adjacency[second * cardCount + third]) triangles++;
    }
  }
  return chooseThree(edgeCount) - adjacentPairs * (edgeCount - 2) + 2 * stars + linkedWedges - triangles;
}

function extrapolateThirdOrder(one: number, two: number, three: number, opponents: number) {
  if (opponents === 1) return one;
  if (opponents === 2) return two;
  if (opponents === 3) return three;
  if (one <= 0 || two <= 0 || three <= 0) return 0;
  if (one >= 1) return 1;
  const pairInteraction = Math.log(Math.max(two / (one * one), 1e-12));
  const tripleInteraction = Math.log(Math.max(three / (one ** 3 * Math.exp(3 * pairInteraction)), 1e-12));
  const projected = Math.exp(
    opponents * Math.log(one)
    + chooseTwo(opponents) * pairInteraction
    + chooseThree(opponents) * tripleInteraction,
  );
  return Math.max(0, Math.min(one, projected));
}

function averageTieShare(winOne: number, tieOne: number, opponents: number) {
  const unbeaten = winOne + tieOne;
  if (tieOne <= 0 || unbeaten <= 0) return .5;
  const tieChance = tieOne / unbeaten;
  const noTie = (1 - tieChance) ** opponents;
  let share = 0;
  let combinations = 1;
  for (let ties = 1; ties <= opponents; ties++) {
    combinations = combinations * (opponents - ties + 1) / ties;
    share += combinations * tieChance ** ties * (1 - tieChance) ** (opponents - ties) / (ties + 1);
  }
  return noTie < 1 ? share / (1 - noTie) : .5;
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
  const projected = { win: 0, tie: 0, lose: 0, equity: 0 };
  const exactTwo = { wins: 0, ties: 0, losses: 0, equity: 0, samples: 0 };
  let equity = 0;

  for (let runoutIndex = 0; runoutIndex < runouts.length; runoutIndex++) {
    const runout = runouts[runoutIndex];
    const blocked = new Set(runout);
    const opponentDeck = available.filter((card) => !blocked.has(card));
    const finalBoard = [...board, ...runout];
    const heroScore = evaluate([...hero, ...finalBoard]);
    const runoutOutcomes = [0, 0, 0];
    const degrees = {
      win: Array(opponentDeck.length).fill(0) as number[],
      tie: Array(opponentDeck.length).fill(0) as number[],
      unbeaten: Array(opponentDeck.length).fill(0) as number[],
    };
    const edges = {
      win: [] as Array<readonly [number, number]>,
      unbeaten: [] as Array<readonly [number, number]>,
    };
    const adjacency = {
      win: new Uint8Array(opponentDeck.length * opponentDeck.length),
      unbeaten: new Uint8Array(opponentDeck.length * opponentDeck.length),
    };
    const addEdge = (kind: "win" | "unbeaten", first: number, second: number) => {
      edges[kind].push([first, second]);
      adjacency[kind][first * opponentDeck.length + second] = 1;
      adjacency[kind][second * opponentDeck.length + first] = 1;
    };
    for (let first = 0; first < opponentDeck.length - 1; first++) {
      for (let second = first + 1; second < opponentDeck.length; second++) {
        const opponentScore = evaluate([opponentDeck[first], opponentDeck[second], ...finalBoard]);
        const comparison = compareScores(heroScore, opponentScore);
        categories[heroScore[0]]++;
        if (comparison > 0) {
          outcomes[0]++; runoutOutcomes[0]++; equity += 1;
          degrees.win[first]++; degrees.win[second]++;
          degrees.unbeaten[first]++; degrees.unbeaten[second]++;
          addEdge("win", first, second);
          addEdge("unbeaten", first, second);
        }
        else if (comparison === 0) {
          outcomes[1]++; runoutOutcomes[1]++; equity += .5;
          degrees.tie[first]++; degrees.tie[second]++;
          degrees.unbeaten[first]++; degrees.unbeaten[second]++;
          addEdge("unbeaten", first, second);
        }
        else { outcomes[2]++; runoutOutcomes[2]++; }
      }
    }
    if (opponents > 1) {
      const runoutHands = runoutOutcomes[0] + runoutOutcomes[1] + runoutOutcomes[2];
      const totalTwo = Number(matchingCount(opponentDeck.length, 2));
      const winTwo = twoEdgeMatchings(runoutOutcomes[0], degrees.win);
      const tieTwo = twoEdgeMatchings(runoutOutcomes[1], degrees.tie);
      const unbeatenEdges = runoutOutcomes[0] + runoutOutcomes[1];
      const unbeatenTwo = twoEdgeMatchings(unbeatenEdges, degrees.unbeaten);
      const tiedTwo = unbeatenTwo - winTwo;
      const oneTieTwo = tiedTwo - tieTwo;
      const equityTwo = winTwo + oneTieTwo / 2 + tieTwo / 3;
      exactTwo.wins += winTwo;
      exactTwo.ties += tiedTwo;
      exactTwo.losses += totalTwo - unbeatenTwo;
      exactTwo.equity += equityTwo;
      exactTwo.samples += totalTwo;

      if (opponents > 2) {
        const totalThree = Number(matchingCount(opponentDeck.length, 3));
        const winThree = threeEdgeMatchings(edges.win, degrees.win, adjacency.win);
        const unbeatenThree = threeEdgeMatchings(edges.unbeaten, degrees.unbeaten, adjacency.unbeaten);
        const winOne = runoutOutcomes[0] / runoutHands;
        const tieOne = runoutOutcomes[1] / runoutHands;
        const unbeatenOne = winOne + tieOne;
        const winAll = extrapolateThirdOrder(winOne, winTwo / totalTwo, winThree / totalThree, opponents);
        const unbeatenAll = Math.max(winAll, extrapolateThirdOrder(unbeatenOne, unbeatenTwo / totalTwo, unbeatenThree / totalThree, opponents));
        const tieAll = Math.max(0, unbeatenAll - winAll);
        projected.win += winAll * 100 / runouts.length;
        projected.tie += tieAll * 100 / runouts.length;
        projected.lose += (1 - unbeatenAll) * 100 / runouts.length;
        projected.equity += (winAll + tieAll * averageTieShare(winOne, tieOne, opponents)) * 100 / runouts.length;
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
    winHands: outcomes[0], tieHands: outcomes[1], loseHands: outcomes[2],
    categories: categories.map(percent), bestHand: HAND_NAMES[topCategory],
  };
  if (opponents === 1) return { ...base, opponents, method: "exact" };
  if (opponents === 2) {
    const tablePercent = (value: number) => value / exactTwo.samples * 100;
    const table = {
      win: tablePercent(exactTwo.wins), tie: tablePercent(exactTwo.ties), lose: tablePercent(exactTwo.losses), equity: tablePercent(exactTwo.equity),
      samples: exactTwo.samples, winHands: exactTwo.wins, tieHands: exactTwo.ties, loseHands: exactTwo.losses, method: "exact" as const,
    };
    return { ...base, table, opponents, method: "exact_multiway" };
  }
  return {
    ...base,
    table: { ...projected, method: "third_order_compensation" },
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
