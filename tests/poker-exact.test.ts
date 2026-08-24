import assert from "node:assert/strict";
import test from "node:test";

import { boardCategoryCatalogue, enumerateExact, estimateMultiway, exactMultiwayDealCount, simulateMultiway } from "../app/poker";
import { PREFLOP_MULTIWAY } from "../app/preflop-calibration.generated";
import { preflopResult } from "../app/preflop";

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
  assert.equal(first.method, "monte_carlo");
  assert.equal(first.samples, 20_000);
  assert.equal(first.winHands + first.tieHands + first.loseHands, first.samples);
  assert.equal(first.runouts.size, 46);
  assert.equal(first.seed, second.seed);
  assert.equal(first.win, second.win);
  assert.equal(first.tie, second.tie);
  assert.equal(first.equity, second.equity);
  assert.ok(first.margin95 > 0 && first.margin95 < 1);
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
  assert.equal(result.hope.nextCards.length, 6);
  assert.ok(result.hope.nextCards.every(({ equity }, index, cards) => index === 0 || cards[index - 1].equity >= equity));
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
