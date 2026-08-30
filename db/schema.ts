export const createPlayersTableSql = `
  CREATE TABLE IF NOT EXISTS score_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    score INTEGER NOT NULL DEFAULT 0
  )
`;

export const createScoreStateTableSql = `
  CREATE TABLE IF NOT EXISTS score_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    player_count INTEGER NOT NULL DEFAULT 5,
    current_level INTEGER NOT NULL DEFAULT 1,
    ranked_players TEXT NOT NULL DEFAULT '["", "", ""]',
    version INTEGER NOT NULL DEFAULT 0,
    initialized INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export const createPlayerNameIndexSql = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_score_players_name
  ON score_players(name)
`;
