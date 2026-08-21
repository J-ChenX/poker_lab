import assert from "node:assert/strict";
import test from "node:test";

import { enumerateExact, exactMultiwayDealCount } from "../app/poker";
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

test("returns the requested deterministic multiplayer approximation for KK five-handed", () => {
  const result = preflopResult(["Ks", "Kh"], 4);
  assert.equal(result.table?.method, "preflop_power");
  assert.ok(Math.abs(result.table!.win - 45.477414160591366) < 1e-10);
  assert.equal(result.win, 82.12);
});
