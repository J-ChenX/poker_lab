package com.pokerlab.tv;

final class Rulebook {
    static final int[] SMALL_BLINDS = {5, 10, 20, 30, 50, 70, 100, 150, 200, 300};
    static final int[] BIG_BLINDS = {10, 20, 40, 60, 100, 140, 200, 300, 400, 600};
    // 从初始筹码数开始，每升一级增加 500，最多为初始筹码的两倍。
    static final int[] REVIVE_CHIPS = {2000, 2500, 3000, 3500, 4000, 4000, 4000, 0, 0, 0};

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
        int pairStart = playerCount % 2 == 0 ? playerCount - 1 : playerCount;
        int chips = REVIVE_CHIPS[level - 1];
        return Math.max(reviveCostFor(pairStart, chips), reviveCostFor(pairStart + 1, chips));
    }

    private static int reviveCostFor(int playerCount, int chips) {
        int prizePool = 0;
        for (int rank = 1; rank <= scoringPlaceCount(playerCount); rank++) {
            prizePool += placementScore(playerCount, rank);
        }
        return (int) Math.ceil(prizePool * (double) chips / (2000 * playerCount + chips))
            + knockoutShare(playerCount, 1);
    }
}
