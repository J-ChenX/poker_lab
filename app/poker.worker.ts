import { boardCombinationDistribution, estimateConditionalMultiway, estimateMultiway, evaluate, monteCarloConditionalMultiway, monteCarloHope, MULTIWAY_MONTE_CARLO_SAMPLES, simulateMultiway } from "./poker";
import type { PokerRequest, PokerResponse } from "./poker-worker-protocol";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<PokerRequest>) => void;
  postMessage: (message: PokerResponse) => void;
};

// A worker handles one request. Terminating it cancels even synchronous
// enumeration immediately; it cannot publish a result for a newer selection.
scope.onmessage = async ({ data }) => {
  try {
    const { hero, board } = data;
    if (data.type === "distribution") {
      scope.postMessage({ type: "distribution", result: boardCombinationDistribution(hero, board) });
      return;
    }
    const estimate = estimateMultiway(hero, board, data.opponents);
    scope.postMessage({ type: "estimate", result: estimate });
    const conditionalWin = estimateConditionalMultiway(hero, board, data.opponents);
    scope.postMessage({ type: "model", result: { ...estimate, conditionalWin } });
    const simulation = await simulateMultiway(hero, board, data.opponents, MULTIWAY_MONTE_CARLO_SAMPLES,
      (progress) => scope.postMessage({ type: "progress", progress }), undefined, { yieldToEventLoop: false });
    const { runouts, headsUp, categories, bestHand, ...table } = simulation;
    const hasFuture = board.length >= 3 && board.length < 5;
    scope.postMessage({ type: "done", result: {
      ...estimate, ...headsUp, categories, bestHand, table,
      hope: hasFuture ? monteCarloHope(runouts, evaluate([...hero, ...board]), [...hero, ...board]) : undefined,
      conditionalWin: hasFuture ? monteCarloConditionalMultiway(runouts, [...hero, ...board]) : undefined,
    } });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : "计算失败，请重试" });
  }
};
