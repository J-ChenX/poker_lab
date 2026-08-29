import assert from "node:assert/strict";
import test from "node:test";
import { knockoutBase, knockoutShare, orbitCount, placementScore, reviveCost, scoringPlaceCount } from "../app/score/rules";

test("名次积分与说明书数值一致", () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => placementScore(12, index + 1)), [52, 35, 20, 10, 8, 6]);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => placementScore(9, index + 1)), [40, 26, 14, 7, 5]);
  assert.equal(placementScore(3, 3), 0);
});

test("复活积分按人数与等级递增", () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => reviveCost(5, index + 1)), [11, 14, 18, 19, 21, 22, 23]);
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => reviveCost(12, index + 1)), [15, 19, 25, 27, 31, 32, 34]);
  assert.equal(reviveCost(4, 3), 0);
  assert.equal(reviveCost(12, 8), 0);
});

test("只显示有积分的前半数名次，最多六名", () => {
  assert.equal(scoringPlaceCount(3), 2);
  assert.equal(scoringPlaceCount(10), 5);
  assert.equal(scoringPlaceCount(11), 6);
  assert.equal(scoringPlaceCount(12), 6);
});

test("多人淘汰积分向上取整", () => {
  assert.equal(knockoutBase(4), 2);
  assert.equal(knockoutBase(8), 3);
  assert.equal(knockoutBase(12), 4);
  assert.equal(knockoutShare(8, 2), 2);
  assert.equal(knockoutShare(12, 3), 2);
});

test("圈数公式保持说明书规则", () => {
  assert.equal(orbitCount(3), 3);
  assert.equal(orbitCount(5), 2);
  assert.equal(orbitCount(12), 1);
});
