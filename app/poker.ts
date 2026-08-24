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
    method: "exact" | "model_estimate" | "monte_carlo" | "preflop_monte_carlo";
    samples?: number;
    margin95?: number;
    seed?: number;
    winHands?: number;
    tieHands?: number;
    loseHands?: number;
  };
  samples: number;
  categories: number[];
  bestHand: string;
  opponents: number;
  method: "exact" | "exact_multiway" | "model_estimate" | "preflop";
  hope?: {
    currentHand: string;
    improve: number;
    competitive: number;
    improvedEquity: number;
    blankEquity: number;
    nextCards: Array<{ card: string; equity: number }>;
  };
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

export function boardCombinationDistribution(hero: string[], board: string[]) {
  if (hero.length !== 2 || board.length < 3 || board.length > 5) return null;
  const used = new Set([...hero, ...board]);
  const available = DECK.filter((card) => !used.has(card));
  const drawCount = 7 - board.length;
  const counts = Array(9).fill(0) as number[];
  const selected: string[] = [];
  let samples = 0;
  const enumerate = (start: number) => {
    if (selected.length === drawCount) {
      counts[evaluate([...board, ...selected])[0]]++;
      samples++;
      return;
    }
    const needed = drawCount - selected.length;
    for (let index = start; index <= available.length - needed; index++) {
      selected.push(available[index]);
      enumerate(index + 1);
      selected.pop();
    }
  };
  enumerate(0);
  const categories = counts.map((count) => count / samples * 100);
  const topCategory = counts.reduce((best, count, index) => count > counts[best] ? index : best, 0);
  return { categories, bestHand: HAND_NAMES[topCategory], samples, drawCount };
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

function twoEdgeMatchings(edges: number, degrees: number[]) {
  return chooseTwo(edges) - degrees.reduce((sum, degree) => sum + chooseTwo(degree), 0);
}

export const MULTIWAY_MONTE_CARLO_SAMPLES = 500_000;
export const QUICK_ESTIMATE_SAMPLES = 4_096;

function scenarioSeed(hero: string[], board: string[], opponents: number) {
  let hash = 0x811c9dc5;
  for (const character of [...hero].sort().join("|") + "/" + [...board].sort().join("|") + `/${opponents}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 0x9e3779b9;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
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

/**
 * Fast first-pass model: probe a small deterministic set of legal heads-up
 * deals, then project its win/tie rates to N opponents with an independence
 * model. It is deliberately replaced by the shared-deck simulation below.
 */
export function estimateMultiway(
  hero: string[],
  board: string[],
  opponents: number,
  samples = QUICK_ESTIMATE_SAMPLES,
): ExactResult {
  if (hero.length !== 2 || (board.length !== 0 && (board.length < 3 || board.length > 5))) throw new Error("快速估算需要两张底牌以及 0、3、4 或 5 张公共牌");
  if (opponents < 1 || opponents > 8) throw new Error("对手人数需要在 1 到 8 之间");
  const used = new Set([...hero, ...board]);
  const deck = DECK.filter((card) => !used.has(card));
  const missingBoard = 5 - board.length;
  const drawCount = missingBoard + 2;
  const totalSamples = Math.max(256, Math.floor(samples));
  const random = seededRandom(scenarioSeed(hero, board, opponents) ^ 0xa511e9b3);
  const outcomes = { win: 0, tie: 0, lose: 0, equity: 0 };
  const categories = Array(9).fill(0) as number[];

  for (let sample = 0; sample < totalSamples; sample++) {
    const swaps: number[] = [];
    for (let index = 0; index < drawCount; index++) {
      const target = index + Math.floor(random() * (deck.length - index));
      swaps.push(target);
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }
    const finalBoard = [...board, ...deck.slice(0, missingBoard)];
    const heroScore = evaluate([...hero, ...finalBoard]);
    const opponentScore = evaluate([deck[missingBoard], deck[missingBoard + 1], ...finalBoard]);
    const comparison = compareScores(heroScore, opponentScore);
    categories[heroScore[0]]++;
    if (comparison > 0) { outcomes.win++; outcomes.equity++; }
    else if (comparison === 0) { outcomes.tie++; outcomes.equity += .5; }
    else outcomes.lose++;
    for (let index = drawCount - 1; index >= 0; index--) {
      const target = swaps[index];
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }
  }

  const percent = (value: number) => value / totalSamples * 100;
  const winOne = outcomes.win / totalSamples;
  const tieOne = outcomes.tie / totalSamples;
  const winAll = winOne ** opponents;
  const unbeatenAll = (winOne + tieOne) ** opponents;
  const tieAll = Math.max(0, unbeatenAll - winAll);
  const topCategory = categories.reduce((best, count, index) => count > categories[best] ? index : best, 0);
  return {
    win: percent(outcomes.win),
    tie: percent(outcomes.tie),
    lose: percent(outcomes.lose),
    equity: percent(outcomes.equity),
    winHands: outcomes.win,
    tieHands: outcomes.tie,
    loseHands: outcomes.lose,
    samples: totalSamples,
    categories: categories.map(percent),
    bestHand: HAND_NAMES[topCategory],
    opponents,
    method: "model_estimate",
    table: {
      win: winAll * 100,
      tie: tieAll * 100,
      lose: (1 - unbeatenAll) * 100,
      equity: (winAll + tieAll * averageTieShare(winOne, tieOne, opponents)) * 100,
      samples: totalSamples,
      method: "model_estimate",
    },
  };
}

/**
 * Deals every unknown card from one shared deck, so board cards and all
 * opponents are correlated exactly as they are at a real table. A stable seed
 * makes the displayed answer and regression tests reproducible.
 */
export async function simulateMultiway(
  hero: string[],
  board: string[],
  opponents: number,
  samples = MULTIWAY_MONTE_CARLO_SAMPLES,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  if (hero.length !== 2 || (board.length !== 0 && (board.length < 3 || board.length > 5))) throw new Error("多人蒙特卡洛需要两张底牌以及 0、3、4 或 5 张公共牌");
  if (opponents < 1 || opponents > 8) throw new Error("对手人数需要在 1 到 8 之间");
  if (signal?.aborted) throw new DOMException("计算已取消", "AbortError");
  const used = new Set([...hero, ...board]);
  const deck = DECK.filter((card) => !used.has(card));
  const missingBoard = 5 - board.length;
  const drawCount = missingBoard + opponents * 2;
  const totalSamples = Math.max(1, Math.floor(samples));
  const seed = scenarioSeed(hero, board, opponents);
  const random = seededRandom(seed);
  const totals = { win: 0, tie: 0, lose: 0, equity: 0, equitySquared: 0 };
  const headsUp = { win: 0, tie: 0, lose: 0, equity: 0 };
  const categories = Array(9).fill(0) as number[];
  const heroScores = new Map<string, Score>();
  const runouts = new Map<string, { cards: string[]; category: number; equity: number; samples: number }>();

  for (let sample = 0; sample < totalSamples; sample++) {
    if (sample % 256 === 0 && signal?.aborted) throw new DOMException("计算已取消", "AbortError");
    const swaps: number[] = [];
    for (let index = 0; index < drawCount; index++) {
      const target = index + Math.floor(random() * (deck.length - index));
      swaps.push(target);
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }

    const runout = deck.slice(0, missingBoard);
    const finalBoard = [...board, ...runout];
    const boardKey = board.length >= 3 ? (missingBoard ? [...runout].sort().join("|") : "river") : "";
    let heroScore = board.length >= 3 ? heroScores.get(boardKey) : undefined;
    if (!heroScore) {
      heroScore = evaluate([...hero, ...finalBoard]);
      if (board.length >= 3) heroScores.set(boardKey, heroScore);
    }
    let tiedOpponents = 0;
    let beaten = false;
    let firstComparison = 0;
    for (let opponent = 0; opponent < opponents; opponent++) {
      const start = missingBoard + opponent * 2;
      const opponentScore = evaluate([deck[start], deck[start + 1], ...finalBoard]);
      const comparison = compareScores(heroScore, opponentScore);
      if (opponent === 0) firstComparison = comparison;
      if (comparison < 0) beaten = true;
      else if (comparison === 0) tiedOpponents++;
    }
    const share = beaten ? 0 : 1 / (tiedOpponents + 1);
    if (beaten) totals.lose++;
    else if (tiedOpponents) totals.tie++;
    else totals.win++;
    totals.equity += share;
    totals.equitySquared += share * share;
    if (firstComparison > 0) { headsUp.win++; headsUp.equity++; }
    else if (firstComparison === 0) { headsUp.tie++; headsUp.equity += .5; }
    else headsUp.lose++;
    categories[heroScore[0]]++;
    if (board.length >= 3) {
      const runoutTotal = runouts.get(boardKey) ?? { cards: runout, category: heroScore[0], equity: 0, samples: 0 };
      runoutTotal.equity += share;
      runoutTotal.samples++;
      runouts.set(boardKey, runoutTotal);
    }

    for (let index = drawCount - 1; index >= 0; index--) {
      const target = swaps[index];
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }
    if ((sample + 1) % 2_000 === 0 || sample === totalSamples - 1) {
      onProgress?.((sample + 1) / totalSamples);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const percent = (value: number) => value / totalSamples * 100;
  const variance = totalSamples > 1
    ? Math.max(0, (totals.equitySquared - totals.equity ** 2 / totalSamples) / (totalSamples - 1))
    : 0;
  const topCategory = categories.reduce((best, count, index) => count > categories[best] ? index : best, 0);
  return {
    win: percent(totals.win),
    tie: percent(totals.tie),
    lose: percent(totals.lose),
    equity: percent(totals.equity),
    samples: totalSamples,
    winHands: totals.win,
    tieHands: totals.tie,
    loseHands: totals.lose,
    margin95: 1.96 * Math.sqrt(variance / totalSamples) * 100,
    seed,
    runouts,
    headsUp: {
      win: percent(headsUp.win), tie: percent(headsUp.tie), lose: percent(headsUp.lose), equity: percent(headsUp.equity),
      samples: totalSamples, winHands: headsUp.win, tieHands: headsUp.tie, loseHands: headsUp.lose,
    },
    categories: categories.map(percent),
    bestHand: HAND_NAMES[topCategory],
    method: "monte_carlo" as const,
  };
}

export function monteCarloHope(
  runouts: Map<string, { cards: string[]; category: number; equity: number; samples: number }>,
  currentScore: Score,
) {
  const summaries = [...runouts.values()].map((runout) => ({
    ...runout,
    equityPercent: runout.equity / runout.samples * 100,
  }));
  const improved = summaries.filter((runout) => runout.category > currentScore[0]);
  const blank = summaries.filter((runout) => runout.category <= currentScore[0]);
  const nextCards = new Map<string, { total: number; count: number }>();
  for (const runout of summaries) {
    for (const card of runout.cards) {
      const total = nextCards.get(card) ?? { total: 0, count: 0 };
      total.total += runout.equityPercent;
      total.count++;
      nextCards.set(card, total);
    }
  }
  const average = (values: typeof summaries) => values.length
    ? values.reduce((sum, runout) => sum + runout.equityPercent, 0) / values.length
    : 0;
  return {
    currentHand: HAND_NAMES[currentScore[0]],
    improve: improved.length / summaries.length * 100,
    competitive: summaries.filter((runout) => runout.equityPercent >= 50).length / summaries.length * 100,
    improvedEquity: average(improved),
    blankEquity: average(blank),
    nextCards: [...nextCards.entries()]
      .map(([card, value]) => ({ card, equity: value.total / value.count }))
      .sort((first, second) => second.equity - first.equity || DECK.indexOf(second.card) - DECK.indexOf(first.card))
      .slice(0, 6),
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
  const outcomes = [0, 0, 0];
  const categories = Array(9).fill(0) as number[];
  const exactTwo = { wins: 0, ties: 0, losses: 0, equity: 0, samples: 0 };
  const currentScore = evaluate([...hero, ...board]);
  const hopeTotals = { improved: 0, competitive: 0, improvedEquity: 0, blankEquity: 0 };
  const nextCardEquities = new Map<string, { total: number; count: number }>();
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
    for (let first = 0; first < opponentDeck.length - 1; first++) {
      for (let second = first + 1; second < opponentDeck.length; second++) {
        const opponentScore = evaluate([opponentDeck[first], opponentDeck[second], ...finalBoard]);
        const comparison = compareScores(heroScore, opponentScore);
        categories[heroScore[0]]++;
        if (comparison > 0) {
          outcomes[0]++; runoutOutcomes[0]++; equity += 1;
          if (opponents === 2) {
            degrees.win[first]++; degrees.win[second]++;
            degrees.unbeaten[first]++; degrees.unbeaten[second]++;
          }
        }
        else if (comparison === 0) {
          outcomes[1]++; runoutOutcomes[1]++; equity += .5;
          if (opponents === 2) {
            degrees.tie[first]++; degrees.tie[second]++;
            degrees.unbeaten[first]++; degrees.unbeaten[second]++;
          }
        }
        else { outcomes[2]++; runoutOutcomes[2]++; }
      }
    }
    const runoutHands = runoutOutcomes[0] + runoutOutcomes[1] + runoutOutcomes[2];
    let runoutEquity = (runoutOutcomes[0] + runoutOutcomes[1] / 2) / runoutHands * 100;
    if (opponents === 2) {
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
      runoutEquity = equityTwo / totalTwo * 100;

    }
    if (missing > 0) {
      const improved = heroScore[0] > currentScore[0];
      if (improved) {
        hopeTotals.improved++;
        hopeTotals.improvedEquity += runoutEquity;
      } else hopeTotals.blankEquity += runoutEquity;
      if (runoutEquity >= 50) hopeTotals.competitive++;
      for (const card of runout) {
        const total = nextCardEquities.get(card) ?? { total: 0, count: 0 };
        total.total += runoutEquity;
        total.count++;
        nextCardEquities.set(card, total);
      }
    }
    if (runoutIndex % 12 === 0 || runoutIndex === runouts.length - 1) {
      onProgress?.((runoutIndex + 1) / runouts.length * (opponents > 2 ? .5 : 1));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const samples = outcomes[0] + outcomes[1] + outcomes[2];
  const percent = (value: number) => value / samples * 100;
  const topCategory = categories.reduce((best, count, index) => count > categories[best] ? index : best, 0);
  const improvedCount = hopeTotals.improved;
  const blankCount = runouts.length - improvedCount;
  const hope = missing > 0 ? {
    currentHand: HAND_NAMES[currentScore[0]],
    improve: improvedCount / runouts.length * 100,
    competitive: hopeTotals.competitive / runouts.length * 100,
    improvedEquity: improvedCount ? hopeTotals.improvedEquity / improvedCount : 0,
    blankEquity: blankCount ? hopeTotals.blankEquity / blankCount : 0,
    nextCards: [...nextCardEquities.entries()]
      .map(([card, value]) => ({ card, equity: value.total / value.count }))
      .sort((first, second) => second.equity - first.equity || DECK.indexOf(second.card) - DECK.indexOf(first.card))
      .slice(0, 6),
  } : undefined;
  const base = {
    win: percent(outcomes[0]), tie: percent(outcomes[1]), lose: percent(outcomes[2]), equity: percent(equity), samples,
    winHands: outcomes[0], tieHands: outcomes[1], loseHands: outcomes[2],
    categories: categories.map(percent), bestHand: HAND_NAMES[topCategory], hope,
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
  const simulation = await simulateMultiway(hero, board, opponents, MULTIWAY_MONTE_CARLO_SAMPLES, (progress) => onProgress?.(.5 + progress * .5));
  const simulatedRunouts = simulation.runouts;
  const table = {
    win: simulation.win, tie: simulation.tie, lose: simulation.lose, equity: simulation.equity,
    samples: simulation.samples, winHands: simulation.winHands, tieHands: simulation.tieHands, loseHands: simulation.loseHands,
    margin95: simulation.margin95, seed: simulation.seed, method: simulation.method,
  };
  const simulatedHope = missing > 0 ? monteCarloHope(simulatedRunouts, currentScore) : undefined;
  return { ...base, hope: simulatedHope, table, opponents, method: "exact" };
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
  if (missing.length === 2 && missing.some((value) => straightHigh([...boardValues, value]) > 0)) return null;
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
    if (missing.length === 2 && missing.some((value) => straightHigh([...suitedBoardValues, value]) > 0)) return null;
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
