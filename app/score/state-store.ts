import { env } from "cloudflare:workers";
import { createPlayerNameIndexSql, createPlayersTableSql, createScoreStateTableSql } from "../../db/schema";
import { scoringPlaceCount } from "./rules";

export type ScorePlayer = { name: string; score: number };
type StoredGameRow = {
  player_count: number;
  current_level: number;
  ranked_players: string;
  version: number;
  initialized: number;
  updated_at: string;
};

export type SharedScoreState = {
  players: ScorePlayer[];
  playerCount: number;
  currentLevel: number;
  rankedPlayers: string[];
  version: number;
  initialized: boolean;
  updatedAt: string | null;
};

export const scoreDatabase = () => env.DB as D1Database;

export function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 20) : "";
}

export function cleanPlayerCount(value: unknown) {
  return Math.min(12, Math.max(3, Math.round(Number(value) || 5)));
}

export function cleanLevel(value: unknown) {
  return Math.min(10, Math.max(1, Math.round(Number(value) || 1)));
}

export function cleanRanks(value: unknown, playerCount: number, validNames: Set<string>) {
  const ranks = Array.isArray(value) ? value : [];
  const used = new Set<string>();
  return Array.from({ length: scoringPlaceCount(playerCount) }, (_, index) => {
    const name = cleanName(ranks[index]);
    const key = name.toLocaleLowerCase();
    if (!name || !validNames.has(key) || used.has(key)) return "";
    used.add(key);
    return name;
  });
}

export async function ensureScoreStateSchema() {
  const database = scoreDatabase();
  await database.batch([
    database.prepare(createPlayersTableSql),
    database.prepare(createScoreStateTableSql),
    database.prepare(createPlayerNameIndexSql),
    database.prepare("INSERT OR IGNORE INTO score_state (id) VALUES (1)"),
  ]);
}

export async function getPlayerNames() {
  const result = await scoreDatabase().prepare("SELECT name FROM score_players ORDER BY id").all<{ name: string }>();
  return new Set(result.results.map((row) => row.name.toLocaleLowerCase()));
}

export async function readScoreState(): Promise<SharedScoreState> {
  const database = scoreDatabase();
  const [playersResult, stateRow] = await Promise.all([
    database.prepare("SELECT name, score FROM score_players ORDER BY id").all<ScorePlayer>(),
    database.prepare("SELECT player_count, current_level, ranked_players, version, initialized, updated_at FROM score_state WHERE id = 1").first<StoredGameRow>(),
  ]);
  const playerCount = cleanPlayerCount(stateRow?.player_count);
  const names = new Set(playersResult.results.map((player) => player.name.toLocaleLowerCase()));
  let storedRanks: unknown = [];
  try { storedRanks = JSON.parse(stateRow?.ranked_players ?? "[]"); } catch { storedRanks = []; }
  return {
    players: playersResult.results.map((player) => ({ name: player.name, score: Number(player.score) || 0 })),
    playerCount,
    currentLevel: cleanLevel(stateRow?.current_level),
    rankedPlayers: cleanRanks(storedRanks, playerCount, names),
    version: Number(stateRow?.version) || 0,
    initialized: Boolean(stateRow?.initialized),
    updatedAt: stateRow?.updated_at ?? null,
  };
}

export async function bumpScoreState(extraSql = "", bindings: unknown[] = []) {
  const assignment = extraSql ? `${extraSql}, ` : "";
  return scoreDatabase().prepare(`UPDATE score_state SET ${assignment}version = version + 1, initialized = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(...bindings);
}
