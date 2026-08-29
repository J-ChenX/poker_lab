import { env } from "cloudflare:workers";
import { knockoutShare, MAX_PLAYERS, MIN_PLAYERS, placementScore, reviveCost } from "../../score/rules";

type RecordResult = {
  playerId: string;
  rank: number;
  revivals: number[];
};

type KnockoutEvent = {
  victimPlayerId: string;
  winnerPlayerIds: string[];
};

function database() {
  if (!env.DB) throw new Error("积分数据库暂不可用");
  return env.DB;
}

async function snapshot() {
  const db = database();
  const [players, games, entries] = await Promise.all([
    db.prepare("SELECT id, name, score, games_played AS gamesPlayed, created_at AS createdAt FROM players ORDER BY score DESC, games_played ASC, name ASC").all(),
    db.prepare("SELECT id, player_count AS playerCount, created_at AS createdAt FROM games ORDER BY created_at DESC LIMIT 12").all(),
    db.prepare("SELECT e.game_id AS gameId, e.player_id AS playerId, p.name, e.rank, e.placement_score AS placementScore, e.revival_cost AS revivalCost, e.knockout_score AS knockoutScore, e.total_delta AS totalDelta FROM score_entries e JOIN players p ON p.id = e.player_id WHERE e.game_id IN (SELECT id FROM games ORDER BY created_at DESC LIMIT 12) ORDER BY e.game_id, e.rank").all(),
  ]);

  const entriesByGame = new Map<string, unknown[]>();
  for (const entry of entries.results) {
    const gameId = String((entry as Record<string, unknown>).gameId);
    const list = entriesByGame.get(gameId) ?? [];
    list.push(entry);
    entriesByGame.set(gameId, list);
  }

  return {
    players: players.results,
    games: games.results.map((game) => ({ ...game, entries: entriesByGame.get(String((game as Record<string, unknown>).id)) ?? [] })),
  };
}

export async function GET() {
  try {
    return Response.json(await snapshot());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取积分失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const db = database();

    if (payload.action === "createPlayer") {
      const name = String(payload.name ?? "").trim();
      if (name.length < 1 || name.length > 20) return Response.json({ error: "姓名需为 1–20 个字符" }, { status: 400 });
      await db.prepare("INSERT INTO players (id, name, score, games_played) VALUES (?, ?, 0, 0)")
        .bind(crypto.randomUUID(), name).run();
      return Response.json(await snapshot(), { status: 201 });
    }

    if (payload.action !== "recordGame") return Response.json({ error: "未知操作" }, { status: 400 });

    const playerCount = Number(payload.playerCount);
    const results = Array.isArray(payload.results) ? payload.results as RecordResult[] : [];
    const knockoutEvents = Array.isArray(payload.knockoutEvents) ? payload.knockoutEvents as KnockoutEvent[] : [];
    if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) return Response.json({ error: "本局人数必须为 3–12 人" }, { status: 400 });
    if (results.length !== playerCount) return Response.json({ error: "参与人员数量与本局人数不一致" }, { status: 400 });

    const playerIds = results.map((result) => String(result.playerId));
    const ranks = results.map((result) => Number(result.rank));
    if (new Set(playerIds).size !== playerCount || playerIds.some((id) => !id)) return Response.json({ error: "每位参与者只能选择一次" }, { status: 400 });
    if (new Set(ranks).size !== playerCount || ranks.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > playerCount)) return Response.json({ error: "名次必须完整且不能重复" }, { status: 400 });

    const existing = await db.prepare(`SELECT id FROM players WHERE id IN (${playerIds.map(() => "?").join(",")})`).bind(...playerIds).all();
    if (existing.results.length !== playerCount) return Response.json({ error: "参与者中包含无效人员" }, { status: 400 });

    const knockoutScores = new Map(playerIds.map((id) => [id, 0]));
    for (const event of knockoutEvents) {
      const victim = String(event.victimPlayerId ?? "");
      const winners = [...new Set((event.winnerPlayerIds ?? []).map(String))];
      if (!playerIds.includes(victim) || winners.length < 1 || winners.some((id) => !playerIds.includes(id) || id === victim)) return Response.json({ error: "淘汰记录包含无效人员" }, { status: 400 });
      const share = knockoutShare(playerCount, winners.length);
      for (const winner of winners) knockoutScores.set(winner, (knockoutScores.get(winner) ?? 0) + share);
    }

    const gameId = crypto.randomUUID();
    const statements = [db.prepare("INSERT INTO games (id, player_count) VALUES (?, ?)").bind(gameId, playerCount)];
    for (const result of results) {
      const revivals = Array.isArray(result.revivals) ? result.revivals.map(Number) : [];
      if (revivals.length > 2 || revivals.some((level) => !Number.isInteger(level) || level < 1 || level > 7) || (playerCount < 5 && revivals.length)) return Response.json({ error: "复活记录不符合规则" }, { status: 400 });
      const placement = placementScore(playerCount, result.rank);
      const revival = revivals.reduce((sum, level) => sum + reviveCost(playerCount, level), 0);
      const knockout = knockoutScores.get(result.playerId) ?? 0;
      const delta = placement + knockout - revival;
      statements.push(
        db.prepare("INSERT INTO score_entries (id, game_id, player_id, rank, placement_score, revival_cost, knockout_score, total_delta, revivals_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), gameId, result.playerId, result.rank, placement, revival, knockout, delta, JSON.stringify(revivals)),
        db.prepare("UPDATE players SET score = score + ?, games_played = games_played + 1 WHERE id = ?").bind(delta, result.playerId),
      );
    }
    await db.batch(statements);
    return Response.json(await snapshot(), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    const friendly = message.includes("UNIQUE") ? "该人员已经登记" : message.includes("no such table") ? "积分数据库尚未完成初始化" : message;
    return Response.json({ error: friendly }, { status: 500 });
  }
}
