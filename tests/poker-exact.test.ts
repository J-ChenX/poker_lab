import assert from "node:assert/strict";
import test from "node:test";

import { boardCategoryCatalogue, enumerateExact, estimateConditionalMultiway, estimateMultiway, evaluate, exactMultiwayDealCount, monteCarloConditionalMultiway, monteCarloHope, simulateMultiway } from "../app/poker";
import { PREFLOP_MULTIWAY } from "../app/preflop-calibration.generated";
import { preflopResult } from "../app/preflop";
import { breakEvenCallAmount } from "../app/pot-odds";

test("break-even calls zero the existing EV formula and handle certain outcomes", () => {
  for (const [pot, equity] of [[100, 25], [100, 50], [100, 80], [0, 25], [100, 0], [100, 99.99]]) {
    const call = breakEvenCallAmount(pot, equity)!;
    assert.ok(Math.abs(equity / 100 * (pot + call) - call) < 1e-8);
  }
  assert.equal(breakEvenCallAmount(100, 50), 100);
  assert.equal(breakEvenCallAmount(100, 80), 400);
  assert.equal(breakEvenCallAmount(100, 100), null);
  assert.equal(breakEvenCallAmount(0, 100), null);
});

test("10–12 player estimates and simulations support every street, including all 27 preflop dimensions", async () => {
  for (const opponents of [9, 10, 11]) {
    for (const board of [[], ["Qs", "Jh", "2d"], ["Qs", "Jh", "2d", "10c"], ["Qs", "Jh", "2d", "10c", "9s"]]) {
      const estimate = estimateMultiway(["As", "Kh"], board, opponents);
      const simulation = await simulateMultiway(["As", "Kh"], board, opponents, 4_096);
      for (const result of [estimate.table!, simulation]) {
        assert.ok([result.win, result.tie, result.lose, result.equity].every((value) => Number.isFinite(value) && value >= 0 && value <= 100));
        assert.ok(Math.abs(result.win + result.tie + result.lose - 100) < 1e-9);
      }
    }
  }
});

test("a shared royal flush splits the pot twelve ways", async () => {
  const board = ["As", "Ks", "Qs", "Js", "10s"];
  const estimate = estimateMultiway(["2h", "3d"], board, 11);
  const simulation = await simulateMultiway(["2h", "3d"], board, 11, 4_096);
  for (const result of [estimate.table!, simulation]) {
    assert.equal(result.win, 0);
    assert.equal(result.tie, 100);
    assert.equal(result.lose, 0);
    assert.ok(Math.abs(result.equity - 100 / 12) < 1e-9);
  }
});

test("invalid table sizes cannot enter a simulation", async () => {
  for (const opponents of [0, 12, 1.5, NaN, Infinity]) {
    assert.throws(() => estimateMultiway(["As", "Kh"], [], opponents), /整数/);
    await assert.rejects(simulateMultiway(["As", "Kh"], [], opponents), /整数/);
  }
});

test("counts legal two-opponent deals without replacement", () => {
  assert.equal(exactMultiwayDealCount(5, 2), 446_985n);
  assert.equal(exactMultiwayDealCount(4, 2), 20_561_310n);
});

test("enumerates an exact three-player river result", async () => {
  const result = await enumerateExact(["As", "Kh"], ["10s", "9s", "8s", "6h", "6d"], 2);
  assert.equal(result.method, "exact_multiway");
  assert.equal(result.table?.method, "exact");
  assert.equal(result.table?.samples, 446_985);
  assert.equal(result.table?.winHands, 52_527);
  assert.equal(result.table?.tieHands, 2_736);
  assert.equal(result.table?.loseHands, 391_722);
  assert.ok(Math.abs((result.table!.win + result.table!.tie + result.table!.lose) - 100) < 1e-9);
});

test("returns the calibrated multiplayer result for KK five-handed", () => {
  const result = preflopResult(["Ks", "Kh"], 4);
  assert.equal(result.table?.method, "preflop_monte_carlo");
  assert.equal(result.table?.win, 49.548);
  assert.equal(result.win, 82.12);
});

test("keeps every preflop calibration curve valid and monotone", () => {
  assert.equal(Object.keys(PREFLOP_MULTIWAY).length, 169);
  for (const rows of Object.values(PREFLOP_MULTIWAY)) {
    assert.equal(rows.length, 7);
    let previousWin = 100;
    for (const [win, tie, equity] of rows) {
      assert.ok(win >= 0 && tie >= 0 && win + tie <= 100);
      assert.ok(equity >= win && equity <= win + tie);
      assert.ok(win <= previousWin);
      previousWin = win;
    }
  }
});

test("deals reproducible shared-deck Monte Carlo samples", async () => {
  const first = await simulateMultiway(["Ac", "3c"], ["5d", "4h", "2s", "Jc"], 4, 20_000);
  const second = await simulateMultiway(["Ac", "3c"], ["5d", "4h", "2s", "Jc"], 4, 20_000);
  const model = estimateMultiway(["Ac", "3c"], ["5d", "4h", "2s", "Jc"], 4);
  assert.equal(first.method, "monte_carlo");
  assert.equal(first.samples, 20_000);
  assert.equal(first.winHands + first.tieHands + first.loseHands, first.samples);
  assert.equal(first.runouts.size, 46);
  assert.equal(first.seed, second.seed);
  assert.equal(first.win, second.win);
  assert.equal(first.tie, second.tie);
  assert.equal(first.equity, second.equity);
  assert.ok(first.margin95 > 0 && first.margin95 < 1);
  assert.ok(Math.abs(model.table!.win - first.win) < 2);
});

test("returns an immediate mathematical estimate before simulation", () => {
  const result = estimateMultiway(["Ac", "3c"], ["5d", "4h", "2s", "Jc"], 4);
  assert.equal(result.method, "model_estimate");
  assert.equal(result.table?.method, "model_estimate");
  assert.equal(result.samples, 4_096);
  assert.ok(result.table!.win > 0 && result.table!.win < 100);
  assert.ok(Math.abs(result.table!.win + result.table!.tie + result.table!.lose - 100) < 1e-9);
});

test("aborts Monte Carlo when the selected cards change", async () => {
  const controller = new AbortController();
  await assert.rejects(
    simulateMultiway(["Ac", "3c"], ["5d", "4h", "2s", "Jc"], 4, 50_000, (progress) => {
      if (progress >= .04) controller.abort();
    }, controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
});

test("counts three-player flop outcomes exactly without enumerating hand pairs", async () => {
  const result = await enumerateExact(["Qs", "Qh"], ["As", "Kd", "7c"], 2);
  assert.equal(result.table?.method, "exact");
  assert.equal(result.table?.samples, Number(exactMultiwayDealCount(3, 2)));
  assert.equal(result.table!.winHands! + result.table!.tieHands! + result.table!.loseHands!, result.table!.samples);
});

test("hope model exposes weak five-player outlook instead of treating any category change as a win", async () => {
  const result = await enumerateExact(["7s", "5h"], ["Ks", "Kh", "2c"], 4);
  assert.ok(result.hope);
  assert.equal(result.hope.currentHand, "一对");
  assert.ok(result.hope.competitive < 5);
  assert.ok(result.hope.improvedEquity < 25);
  assert.ok(result.hope.blankEquity < 1);
  assert.equal(result.hope.cardsRemaining, 2);
  assert.ok(Math.abs(result.hope.oneCardImprove + result.hope.twoCardImprove - result.hope.improve) < 1e-9);
  assert.equal(result.hope.nextCards.length, 6);
  assert.ok(result.hope.nextCards.every(({ equity }, index, cards) => index === 0 || cards[index - 1].equity >= equity));
});

test("hope model separates one-card outs from two-card backdoor routes", () => {
  const cards = ["Ah", "Kh", "2h", "7c", "9d"];
  const hope = monteCarloHope(new Map([
    ["3h|4h", { cards: ["3h", "4h"], category: 5, equity: .7, samples: 1 }],
    ["As|4c", { cards: ["As", "4c"], category: 1, equity: .6, samples: 1 }],
  ]), evaluate(cards), cards);
  assert.equal(hope.cardsRemaining, 2);
  assert.equal(hope.oneCardImprove, 50);
  assert.equal(hope.twoCardImprove, 50);
  assert.ok(hope.immediateOuts.includes("As"));
  assert.ok(!hope.immediateOuts.includes("3h"));
});

test("keeps 40-60, 60-80 and over-80 cards exclusive while counts stay cumulative", () => {
  const analysis = monteCarloConditionalMultiway(new Map([
    ["2s", { cards: ["2s"], wins: 50, samples: 100 }],
    ["3s", { cards: ["3s"], wins: 70, samples: 100 }],
    ["4s", { cards: ["4s"], wins: 90, samples: 100 }],
    ["5s", { cards: ["5s"], wins: 30, samples: 100 }],
  ]), ["Ah", "Kd", "2c", "7h", "9s", "Jd"])!;
  assert.deepEqual(analysis.ranges.map(({ oneCardOuts }) => oneCardOuts.map(({ card }) => card)), [["2s"], ["3s"], ["4s"]]);
  assert.deepEqual(analysis.ranges.map(({ cumulativeOuts }) => cumulativeOuts), [3, 2, 1]);
});

test("produces an immediate deterministic multiway conditional model", () => {
  const analysis = estimateConditionalMultiway(["Ah", "Kd"], ["2c", "7h", "9s", "Jd"], 4)!;
  assert.equal(analysis.source, "model");
  assert.equal(analysis.availableCards, 46);
  assert.equal(analysis.totalRunouts, 46);
  assert.deepEqual(analysis.ranges.map(({ label }) => label), ["40–60%", "60–80%", ">80%"]);
});

test("uses exact disjoint opponent combinations for a fixed three-player river", async () => {
  const hero = ["As", "Kh"];
  const turn = ["10s", "9s", "8s", "6h"];
  const analysis = estimateConditionalMultiway(hero, turn, 2)!;
  const candidate = analysis.ranges.flatMap(({ oneCardOuts }) => oneCardOuts)[0];
  assert.ok(candidate);
  const exact = await enumerateExact(hero, [...turn, candidate.card], 2);
  assert.ok(Math.abs(candidate.winRate - exact.table!.win) < 1e-9);
});

test("weights conditional Monte Carlo cards by their actual sample counts", () => {
  const analysis = monteCarloConditionalMultiway(new Map([
    ["2s|3s", { cards: ["2s", "3s"], wins: 1, samples: 1 }],
    ["2s|4s", { cards: ["2s", "4s"], wins: 4, samples: 9 }],
  ]), ["Ah", "Kd", "2c", "7h", "9s"])!;
  const twoOfSpades = analysis.ranges[0].oneCardOuts.find(({ card }) => card === "2s");
  assert.ok(twoOfSpades);
  assert.equal(twoOfSpades.winRate, 50);
});

test("hope is only shown while future community cards remain", async () => {
  const turn = await enumerateExact(["As", "Qh"], ["Ks", "9h", "2c", "4d"], 1);
  const river = await enumerateExact(["As", "Qh"], ["Ks", "9h", "2c", "4d", "7s"], 1);
  assert.ok(turn.hope);
  assert.equal(river.hope, undefined);
});

test("catalogue keeps non-adjacent two-rank straight requirements", () => {
  const catalogue = boardCategoryCatalogue(["5d", "3h", "2s", "7c"], ["Ac", "4c"]);
  const straights = catalogue.find(({ category }) => category === 4)!.variants.map(({ label }) => label);
  assert.deepEqual(straights, ["46", "A4"]);
});

test("catalogue still folds a two-rank straight into a one-rank requirement", () => {
  const catalogue = boardCategoryCatalogue(["10s", "9s", "8s", "6h", "6d"], ["As", "Kh"]);
  const straights = catalogue.find(({ category }) => category === 4)!.variants.map(({ label }) => label);
  assert.deepEqual(straights, ["JQ", "7"]);
});
