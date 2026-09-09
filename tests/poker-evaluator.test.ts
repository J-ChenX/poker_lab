import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createEvaluator, encodeCard, unpackScore } from "../app/poker-evaluator";
import { DECK, evaluate, estimateMultiway, simulateMultiway, estimateConditionalMultiway } from "../app/poker";
import { evaluateReference } from "../scripts/lib/poker-reference";
import baseline from "./fixtures/poker-baseline.json";

test("all 2,598,960 five-card hands have the exact category distribution", () => {
  const counts = Array(9).fill(0) as number[];
  const evaluator = createEvaluator();
  const cards = new Uint8Array(5);
  for (let a = 0; a < 48; a++) {
    cards[0] = a;
    for (let b = a + 1; b < 49; b++) {
      cards[1] = b;
      for (let c = b + 1; c < 50; c++) {
        cards[2] = c;
        for (let d = c + 1; d < 51; d++) {
          cards[3] = d;
          for (let e = d + 1; e < 52; e++) {
            cards[4] = e;
            counts[evaluator.evaluate(cards) >>> 20]++;
          }
        }
      }
    }
  }
  assert.deepEqual(counts, [1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 40]);
});

test("packed scores and prepared boards match an independent five-card-subset oracle", () => {
  let state = 0x31415926;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const evaluator = createEvaluator();
  const deck = [...DECK];
  for (let trial = 0; trial < 6_000; trial++) {
    const length = 5 + trial % 3;
    for (let index = 0; index < length; index++) {
      const target = index + Math.floor(random() * (52 - index));
      [deck[index], deck[target]] = [deck[target], deck[index]];
    }
    const cards = deck.slice(0, length);
    const expected = evaluateReference(cards);
    assert.deepEqual(evaluate(cards), expected, cards.join(" "));
    evaluator.setBoard(cards.slice(2).map(encodeCard));
    assert.deepEqual(unpackScore(evaluator.pair(encodeCard(cards[0]), encodeCard(cards[1]))), expected);
    // Another pair on the same board detects scratch-state leaks, including
    // two cards of the same suit/rank and cards whose ranks occur on the board.
    const otherPair = deck.slice(length, length + 2);
    assert.deepEqual(unpackScore(evaluator.pair(encodeCard(otherPair[0]), encodeCard(otherPair[1]))), evaluateReference([...cards.slice(2), ...otherPair]));
    assert.deepEqual(unpackScore(evaluator.pair(encodeCard(cards[1]), encodeCard(cards[0]))), expected);
  }
});

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value,
  (_, item) => item instanceof Map ? [...item] : item)).digest("hex");

test("all streets and table sizes retain original seeded probabilities and runout statistics", async () => {
  for (const fixture of baseline.scenarios) {
    assert.equal(fingerprint(estimateMultiway(baseline.hero, fixture.board, fixture.opponents)), fixture.estimate);
    const simulation = await simulateMultiway(baseline.hero, fixture.board, fixture.opponents, baseline.samples);
    assert.equal(fingerprint(simulation), fixture.simulation);
    const workerSimulation = await simulateMultiway(baseline.hero, fixture.board, fixture.opponents, baseline.samples, undefined, undefined, { yieldToEventLoop: false });
    assert.equal(fingerprint(workerSimulation), fixture.simulation);
  }
  assert.equal(fingerprint(estimateConditionalMultiway(baseline.hero, baseline.conditional.board, 4)), baseline.conditional.fingerprint);
});
