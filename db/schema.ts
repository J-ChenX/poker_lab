import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  score: integer("score").notNull().default(0),
  gamesPlayed: integer("games_played").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  playerCount: integer("player_count").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const scoreEntries = sqliteTable("score_entries", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => games.id),
  playerId: text("player_id").notNull().references(() => players.id),
  rank: integer("rank").notNull(),
  placementScore: integer("placement_score").notNull(),
  revivalCost: integer("revival_cost").notNull(),
  knockoutScore: integer("knockout_score").notNull(),
  totalDelta: integer("total_delta").notNull(),
  revivalsJson: text("revivals_json").notNull().default("[]"),
}, (table) => [index("idx_score_entries_game_id").on(table.gameId)]);
