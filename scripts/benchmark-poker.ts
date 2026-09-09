import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as current from "../app/poker";

// Optional original module makes before/after runs reproducible without
// checking out or overwriting the working tree. Three rounds include cold JIT.
const moduleIndex = process.argv.indexOf("--module");
const poker: typeof current = moduleIndex < 0 ? current : await import(pathToFileURL(resolve(process.argv[moduleIndex + 1])).href);
const hero = ["As", "Kh"];
const board = ["Qs", "Jh", "2d"];
const timings: Record<string, number[]> = {};
for (let round = 0; round < 3; round++) {
  const stages: Array<[string, () => unknown]> = [
    ["distribution", () => poker.boardCombinationDistribution(hero, board)],
    ["quick_4096", () => poker.estimateMultiway(hero, board, 4)],
    ["conditional_flop", () => poker.estimateConditionalMultiway(hero, board, 4)],
    ["monte_carlo_500000", () => poker.simulateMultiway(hero, board, 4)],
  ];
  for (const [name, run] of stages) {
    const start = performance.now();
    await run();
    const ms = Math.round(performance.now() - start);
    (timings[name] ??= []).push(ms);
    console.log(JSON.stringify({ round: round + 1, stage: name, ms }));
  }
}
console.log(JSON.stringify({ runtime: process.version, hero, board, opponents: 4, samples: 500_000,
  medianMs: Object.fromEntries(Object.entries(timings).map(([stage, values]) => [stage, [...values].sort((a, b) => a - b)[1]])),
}));
