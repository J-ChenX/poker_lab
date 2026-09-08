import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BLIND_LEVELS, INITIAL_CHIPS, knockoutBase, knockoutShare, orbitCount, placementScore, reviveCost, scoringPlaceCount } from "../app/score/rules";

test("名次积分与说明书数值一致", () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => placementScore(12, index + 1)), [52, 35, 20, 10, 8, 6]);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => placementScore(9, index + 1)), [40, 26, 14, 7, 5]);
  assert.equal(placementScore(3, 3), 0);
});

test("L1 与初始筹码一致，后续每级增加 500、最多两倍初始筹码，L8 起关闭", () => {
  assert.equal(BLIND_LEVELS[0].chips, INITIAL_CHIPS);
  assert.deepEqual(BLIND_LEVELS.map((blind) => blind.chips), [2000, 2500, 3000, 3500, 4000, 4000, 4000, null, null, null]);
  let previousBB = Infinity;
  for (const blind of BLIND_LEVELS.slice(0, 7)) {
    assert.ok(blind.chips !== null && blind.chips <= 2 * INITIAL_CHIPS);
    assert.ok(blind.chips / blind.big <= previousBB);
    previousBB = blind.chips / blind.big;
    assert.equal(blind.chips % (blind.level >= 7 ? 100 : 10), 0);
  }
});

test("减少筹码后按原积分公式重新定价，同人数档同价", () => {
  const expected = [
    [11, 13, 14, 15, 17, 17, 17],
    [12, 14, 16, 17, 19, 19, 19],
    [14, 16, 18, 20, 22, 22, 22],
    [15, 17, 19, 21, 23, 23, 23],
  ];
  for (let count = 5; count <= 12; count++) {
    assert.deepEqual(Array.from({ length: 7 }, (_, index) => reviveCost(count, index + 1)), expected[Math.floor((count - 5) / 2)]);
  }
  for (const count of [3, 4, 13, 5.5, NaN]) assert.equal(reviveCost(count, 3), 0);
  for (const level of [0, 8, 9, 10, 11, 1.5, NaN]) assert.equal(reviveCost(12, level), 0);
});

test("电视原生看板与网页使用同一复活筹码表", () => {
  const java = readFileSync(new URL("../android-tv/app/src/main/java/com/pokerlab/tv/Rulebook.java", import.meta.url), "utf8");
  const chips = java.match(/REVIVE_CHIPS = \{([^}]+)\}/);
  assert.ok(chips);
  assert.deepEqual(chips[1].split(",").map(Number), BLIND_LEVELS.map((blind) => blind.chips ?? 0));
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
