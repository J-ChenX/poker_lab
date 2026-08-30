import { env } from "cloudflare:workers";
import { createPlayerNameIndexSql, createPlayersTableSql, createScoreStateTableSql } from "../../../db/schema";
import { scoringPlaceCount } from "../../score/rules";

type Player = { name: string; score: number };
type StoredGameRow = {
  player_count: number;
  current_level: number;
  ranked_players: string;
  version: number;
  initialized: number;
  updated_at: string;
};

type ScoreAction =
  | { type: "replaceState"; players: Player[]; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addPlayer"; name: string }
  | { type: "deletePlayer"; name: string }
  | { type: "resetScores" }
  | { type: "setGame"; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addScores"; changes: { name: string; amount: number }[]; clearRanks?: boolean };

const db = () => env.DB as D1Database;
const jsonHeaders = { "cache-control": "no-store, no-cache, must-revalidate", "content-type": "application/json; charset=utf-8" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 20) : "";
}

function cleanPlayerCount(value: unknown) {
  return Math.min(12, Math.max(3, Math.round(Number(value) || 5)));
}

function cleanLevel(value: unknown) {
  return Math.min(10, Math.max(1, Math.round(Number(value) || 1)));
}

function cleanRanks(value: unknown, playerCount: number, validNames: Set<string>) {
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

async function ensureSchema() {
  const database = db();
  await database.batch([
    database.prepare(createPlayersTableSql),
    database.prepare(createScoreStateTableSql),
    database.prepare(createPlayerNameIndexSql),
    database.prepare("INSERT OR IGNORE INTO score_state (id) VALUES (1)"),
  ]);
}

async function getPlayerNames() {
  const result = await db().prepare("SELECT name FROM score_players ORDER BY id").all<{ name: string }>();
  return new Set(result.results.map((row) => row.name.toLocaleLowerCase()));
}

async function readState() {
  const database = db();
  const [playersResult, stateRow] = await Promise.all([
    database.prepare("SELECT name, score FROM score_players ORDER BY id").all<Player>(),
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

async function bumpState(extraSql = "", bindings: unknown[] = []) {
  const assignment = extraSql ? `${extraSql}, ` : "";
  return db().prepare(`UPDATE score_state SET ${assignment}version = version + 1, initialized = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(...bindings);
}

export async function GET() {
  await ensureSchema();
  return json(await readState());
}
export async function POST(request: Request) {
  await ensureSchema();
  let action: ScoreAction;
  try { action = await request.json() as ScoreAction; } catch { return json({ error: "请求数据格式错误" }, 400); }
  const database = db();

  try {
    if (action.type === "replaceState") {
      const playerCount = cleanPlayerCount(action.playerCount);
      const currentLevel = cleanLevel(action.currentLevel);
      const uniquePlayers = new Map<string, Player>();
      for (const item of Array.isArray(action.players) ? action.players : []) {
        const name = cleanName(item?.name);
        if (!name) continue;
        const key = name.toLocaleLowerCase();
        if (!uniquePlayers.has(key)) uniquePlayers.set(key, { name, score: Math.round(Number(item.score) || 0) });
      }
      const names = new Set(uniquePlayers.keys());
      const rankedPlayers = cleanRanks(action.rankedPlayers, playerCount, names);
      const statements = [database.prepare("DELETE FROM score_players")];
      for (const player of uniquePlayers.values()) statements.push(database.prepare("INSERT INTO score_players (name, score) VALUES (?, ?)").bind(player.name, player.score));
      statements.push(await bumpState("player_count = ?, current_level = ?, ranked_players = ?", [playerCount, currentLevel, JSON.stringify(rankedPlayers)]));
      await database.batch(statements);
    } else if (action.type === "addPlayer") {
      const name = cleanName(action.name);
      if (!name) return json({ error: "请输入人员姓名" }, 400);
      await database.batch([
        database.prepare("INSERT INTO score_players (name, score) VALUES (?, 0)").bind(name),
        await bumpState(),
      ]);
    } else if (action.type === "deletePlayer") {
      const name = cleanName(action.name);
      const state = await readState();
      const nextRanks = state.rankedPlayers.map((rankedName) => rankedName.toLocaleLowerCase() === name.toLocaleLowerCase() ? "" : rankedName);
      await database.batch([
        database.prepare("DELETE FROM score_players WHERE name = ? COLLATE NOCASE").bind(name),
        await bumpState("ranked_players = ?", [JSON.stringify(nextRanks)]),
      ]);
    } else if (action.type === "resetScores") {
      await database.batch([database.prepare("UPDATE score_players SET score = 0"), await bumpState()]);
    } else if (action.type === "setGame") {
      const playerCount = cleanPlayerCount(action.playerCount);
      const currentLevel = cleanLevel(action.currentLevel);
      const rankedPlayers = cleanRanks(action.rankedPlayers, playerCount, await getPlayerNames());
      await (await bumpState("player_count = ?, current_level = ?, ranked_players = ?", [playerCount, currentLevel, JSON.stringify(rankedPlayers)])).run();
    } else if (action.type === "addScores") {
      const changes = Array.isArray(action.changes) ? action.changes : [];
      if (!changes.length) return json({ error: "没有需要记录的积分" }, 400);
      const statements = changes.map((change) => database.prepare("UPDATE score_players SET score = score + ? WHERE name = ? COLLATE NOCASE").bind(Math.round(Number(change.amount) || 0), cleanName(change.name)));
      statements.push(action.clearRanks
        ? await bumpState("ranked_players = ?", [JSON.stringify(Array(scoringPlaceCount((await readState()).playerCount)).fill(""))])
        : await bumpState());
      await database.batch(statements);
    } else {
      return json({ error: "不支持的操作" }, 400);
    }
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? "该人员已经存在" : "数据保存失败，请重试";
    return json({ error: message }, 409);
  }

  return json(await readState());
}
