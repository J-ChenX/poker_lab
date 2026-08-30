import { scoringPlaceCount } from "../../score/rules";
import {
  bumpScoreState,
  cleanLevel,
  cleanName,
  cleanPlayerCount,
  cleanRanks,
  ensureScoreStateSchema,
  getPlayerNames,
  readScoreState,
  scoreDatabase,
  ScorePlayer,
} from "../../score/state-store";

type ScoreAction =
  | { type: "replaceState"; players: ScorePlayer[]; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addPlayer"; name: string }
  | { type: "deletePlayer"; name: string }
  | { type: "resetScores" }
  | { type: "setGame"; playerCount: number; currentLevel: number; rankedPlayers: string[] }
  | { type: "addScores"; changes: { name: string; amount: number }[]; clearRanks?: boolean };

const jsonHeaders = { "cache-control": "no-store, no-cache, must-revalidate", "content-type": "application/json; charset=utf-8" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

export async function GET() {
  await ensureScoreStateSchema();
  return json(await readScoreState());
}
export async function POST(request: Request) {
  await ensureScoreStateSchema();
  let action: ScoreAction;
  try { action = await request.json() as ScoreAction; } catch { return json({ error: "请求数据格式错误" }, 400); }
  const database = scoreDatabase();

  try {
    if (action.type === "replaceState") {
      const playerCount = cleanPlayerCount(action.playerCount);
      const currentLevel = cleanLevel(action.currentLevel);
      const uniquePlayers = new Map<string, ScorePlayer>();
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
      statements.push(await bumpScoreState("player_count = ?, current_level = ?, ranked_players = ?", [playerCount, currentLevel, JSON.stringify(rankedPlayers)]));
      await database.batch(statements);
    } else if (action.type === "addPlayer") {
      const name = cleanName(action.name);
      if (!name) return json({ error: "请输入人员姓名" }, 400);
      await database.batch([
        database.prepare("INSERT INTO score_players (name, score) VALUES (?, 0)").bind(name),
        await bumpScoreState(),
      ]);
    } else if (action.type === "deletePlayer") {
      const name = cleanName(action.name);
      const state = await readScoreState();
      const nextRanks = state.rankedPlayers.map((rankedName) => rankedName.toLocaleLowerCase() === name.toLocaleLowerCase() ? "" : rankedName);
      await database.batch([
        database.prepare("DELETE FROM score_players WHERE name = ? COLLATE NOCASE").bind(name),
        await bumpScoreState("ranked_players = ?", [JSON.stringify(nextRanks)]),
      ]);
    } else if (action.type === "resetScores") {
      await database.batch([database.prepare("UPDATE score_players SET score = 0"), await bumpScoreState()]);
    } else if (action.type === "setGame") {
      const playerCount = cleanPlayerCount(action.playerCount);
      const currentLevel = cleanLevel(action.currentLevel);
      const rankedPlayers = cleanRanks(action.rankedPlayers, playerCount, await getPlayerNames());
      await (await bumpScoreState("player_count = ?, current_level = ?, ranked_players = ?", [playerCount, currentLevel, JSON.stringify(rankedPlayers)])).run();
    } else if (action.type === "addScores") {
      const changes = Array.isArray(action.changes) ? action.changes : [];
      if (!changes.length) return json({ error: "没有需要记录的积分" }, 400);
      const statements = changes.map((change) => database.prepare("UPDATE score_players SET score = score + ? WHERE name = ? COLLATE NOCASE").bind(Math.round(Number(change.amount) || 0), cleanName(change.name)));
      statements.push(action.clearRanks
        ? await bumpScoreState("ranked_players = ?", [JSON.stringify(Array(scoringPlaceCount((await readScoreState()).playerCount)).fill(""))])
        : await bumpScoreState());
      await database.batch(statements);
    } else {
      return json({ error: "不支持的操作" }, 400);
    }
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? "该人员已经存在" : "数据保存失败，请重试";
    return json({ error: message }, 409);
  }

  return json(await readScoreState());
}
