import assert from "node:assert/strict";
import test from "node:test";

import { enumerateExact, exactMultiwayDealCount } from "../app/poker";
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
  assert.equal(result.table?.method, "preflop_compensation");
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

test("counts three-player flop outcomes exactly without enumerating hand pairs", async () => {
  const result = await enumerateExact(["Qs", "Qh"], ["As", "Kd", "7c"], 2);
  assert.equal(result.table?.method, "exact");
  assert.equal(result.table?.samples, Number(exactMultiwayDealCount(3, 2)));
  assert.equal(result.table!.winHands! + result.table!.tieHands! + result.table!.loseHands!, result.table!.samples);
});
