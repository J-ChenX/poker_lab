import { DECK, enumerateExact } from "../app/poker";
import { preflopResult } from "../app/preflop";

type Rates = { win: number; tie: number; lose: number; equity: number };
type Scenario = { name: string; hero: string[]; board: string[]; opponents: number };

const trials = Math.max(10_000, Number(process.env.MC_TRIALS) || 500_000);

const rankValue = (card: string) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].indexOf(card.slice(0, -1)) + 2;

function compareReference(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function fiveCardReference(cards: string[]) {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.slice(-1) === cards[0].slice(-1));
  const unique = [...counts.keys()].sort((a, b) => b - a);
  const straightHigh = unique.length === 5
    ? unique[0] - unique[4] === 4 ? unique[0] : unique.join(",") === "14,5,4,3,2" ? 5 : 0
    : 0;
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.filter((group) => group[1] === 1).map((group) => group[0])];
  const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]).sort((a, b) => b - a);
  if (pairs.length === 2) return [2, pairs[0], pairs[1], groups.find((group) => group[1] === 1)![0]];
  if (pairs.length === 1) return [1, pairs[0], ...groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a)];
  return [0, ...values];
}

function evaluateReference(cards: string[]) {
  let best: number[] = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const score = fiveCardReference([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best.length || compareReference(score, best) > 0) best = score;
          }
  return best;
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

function simulate({ hero, board, opponents }: Scenario, samples: number, seed: number): Rates {
  const random = seededRandom(seed);
  const used = new Set([...hero, ...board]);
  const deck = DECK.filter((card) => !used.has(card));
  const missingBoard = 5 - board.length;
  const drawCount = missingBoard + opponents * 2;
  const totals = { win: 0, tie: 0, lose: 0, equity: 0 };

  for (let sample = 0; sample < samples; sample++) {
    const swaps: number[] = [];
    for (let index = 0; index < drawCount; index++) {
      const target = index + Math.floor(random() * (deck.length - index));
      swaps.push(target);
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }

    const finalBoard = [...board, ...deck.slice(0, missingBoard)];
    const heroScore = evaluateReference([...hero, ...finalBoard]);
    let tiedOpponents = 0;
    let beaten = false;
    for (let opponent = 0; opponent < opponents; opponent++) {
      const start = missingBoard + opponent * 2;
      const opponentScore = evaluateReference([deck[start], deck[start + 1], ...finalBoard]);
      const comparison = compareReference(heroScore, opponentScore);
      if (comparison < 0) beaten = true;
      else if (comparison === 0) tiedOpponents++;
    }
    if (beaten) totals.lose++;
    else if (tiedOpponents) {
      totals.tie++;
      totals.equity += 1 / (tiedOpponents + 1);
    } else {
      totals.win++;
      totals.equity++;
    }

    for (let index = drawCount - 1; index >= 0; index--) {
      const target = swaps[index];
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }
  }

  const percent = (value: number) => value / samples * 100;
  return { win: percent(totals.win), tie: percent(totals.tie), lose: percent(totals.lose), equity: percent(totals.equity) };
}

function margin95(percent: number) {
  const probability = percent / 100;
  return 1.96 * Math.sqrt(probability * (1 - probability) / trials) * 100;
}

const scenarios: Scenario[] = [
  { name: "河牌·单挑", hero: ["Kh", "Qh"], board: ["As", "Ah", "Ad", "4c", "2s"], opponents: 1 },
  { name: "河牌·5人桌", hero: ["As", "Kh"], board: ["10s", "9s", "8s", "6h", "6d"], opponents: 4 },
  { name: "转牌·单挑", hero: ["As", "Kh"], board: ["10s", "9s", "8s", "6h"], opponents: 1 },
  { name: "翻牌·单挑", hero: ["Qs", "Qh"], board: ["As", "Kd", "7c"], opponents: 1 },
  { name: "翻牌前·单挑", hero: ["As", "Kh"], board: [], opponents: 1 },
  { name: "翻牌前KK·单挑", hero: ["Ks", "Kh"], board: [], opponents: 1 },
];

const selectedScenarios = process.env.MC_FILTER
  ? scenarios.filter((scenario) => scenario.name.includes(process.env.MC_FILTER!))
  : scenarios;

for (let index = 0; index < selectedScenarios.length; index++) {
  const scenario = selectedScenarios[index];
  const production = scenario.board.length === 0
    ? preflopResult(scenario.hero, scenario.opponents)
    : await enumerateExact(scenario.hero, scenario.board, scenario.opponents);
  const expected: Rates = production.table ?? production;
  const monteCarlo = simulate(scenario, trials, 0x9e3779b9 + index * 0x10001);
  const metrics = (["win", "tie", "lose", "equity"] as const).map((metric) => ({
    metric,
    production: expected[metric],
    monteCarlo: monteCarlo[metric],
    deviationPoints: monteCarlo[metric] - expected[metric],
    margin95: margin95(monteCarlo[metric]),
    within95: Math.abs(monteCarlo[metric] - expected[metric]) <= margin95(monteCarlo[metric]),
  }));
  console.log(JSON.stringify({ scenario: scenario.name, trials, hero: scenario.hero, board: scenario.board, opponents: scenario.opponents, metrics }));
}
