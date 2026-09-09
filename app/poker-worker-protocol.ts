import type { ExactResult } from "./poker";

export type PokerRequest =
  | { type: "distribution"; hero: string[]; board: string[] }
  | { type: "calculate"; hero: string[]; board: string[]; opponents: number };

export type PokerResponse =
  | { type: "distribution"; result: { categories: number[]; bestHand: string; samples: number; drawCount: number } | null }
  | { type: "estimate" | "model" | "done"; result: ExactResult }
  | { type: "progress"; progress: number }
  | { type: "error"; message: string };
