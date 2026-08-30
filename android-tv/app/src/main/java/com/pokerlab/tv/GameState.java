package com.pokerlab.tv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class GameState {
    static final class Player {
        final String name;
        final int score;

        Player(String name, int score) {
            this.name = name;
            this.score = score;
        }
    }

    final List<Player> players = new ArrayList<>();
    final List<String> rankedPlayers = new ArrayList<>();
    int playerCount = 5;
    int currentLevel = 1;
    int version = 0;

    static GameState fromJson(JSONObject json) {
        GameState state = new GameState();
        state.playerCount = Math.max(3, Math.min(12, json.optInt("playerCount", 5)));
        state.currentLevel = Math.max(1, Math.min(10, json.optInt("currentLevel", 1)));
        state.version = json.optInt("version", 0);

        JSONArray players = json.optJSONArray("players");
        if (players != null) {
            for (int index = 0; index < players.length(); index++) {
                JSONObject player = players.optJSONObject(index);
                if (player == null) continue;
                String name = player.optString("name", "").trim();
                if (!name.isEmpty()) state.players.add(new Player(name, player.optInt("score", 0)));
            }
        }

        JSONArray ranks = json.optJSONArray("rankedPlayers");
        if (ranks != null) {
            for (int index = 0; index < ranks.length(); index++) state.rankedPlayers.add(ranks.optString(index, ""));
        }
        while (state.rankedPlayers.size() < Rulebook.scoringPlaceCount(state.playerCount)) state.rankedPlayers.add("");
        return state;
    }
}
