package com.pokerlab.tv;

final class Rulebook {
    static final int[] SMALL_BLINDS = {5, 10, 20, 30, 50, 70, 100, 150, 200, 300};
    static final int[] BIG_BLINDS = {10, 20, 40, 60, 100, 140, 200, 300, 400, 600};
    static final int[] REVIVE_CHIPS = {2000, 3000, 4500, 5000, 6000, 6500, 7000, 0, 0, 0};

    private Rulebook() {}

    static int scoringPlaceCount(int playerCount) {
        return Math.min(6, (playerCount + 1) / 2);
    }

    static int placementScore(int playerCount, int rank) {
        int[] scores = {
            4 * playerCount + 4,
            3 * playerCount - 1,
            2 * playerCount - 4,
            playerCount - 2,
            playerCount - 4,
            playerCount - 6
        };
        if (rank < 1 || rank > scoringPlaceCount(playerCount)) return 0;
        return Math.max(0, scores[rank - 1]);
    }

    static int knockoutShare(int playerCount, int winnerCount) {
        int base = (int) Math.ceil(playerCount / 4.0) + 1;
        return (int) Math.ceil(base / (double) Math.max(1, winnerCount));
    }

    static int reviveCost(int playerCount, int level) {
        if (playerCount < 5 || playerCount > 12 || level < 1 || level > 7) return 0;
        int[] row;
        if (playerCount <= 6) row = new int[]{11, 14, 18, 19, 21, 22, 23};
        else if (playerCount <= 8) row = new int[]{12, 16, 20, 22, 24, 26, 27};
        else if (playerCount <= 10) row = new int[]{14, 18, 23, 25, 28, 30, 31};
        else row = new int[]{15, 19, 25, 27, 31, 32, 34};
        return row[level - 1];
    }
}
