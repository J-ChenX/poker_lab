// Cards use the same suit-major order as DECK. Scores compare as integers:
// category followed by five rank nibbles, with unused kickers set to zero.
const CARD_RANK = Uint8Array.from({ length: 52 }, (_, card) => card % 13 + 2);
const CARD_SUIT = Uint8Array.from({ length: 52 }, (_, card) => Math.floor(card / 13));
const CARD_BIT = Uint16Array.from(CARD_RANK, (rank) => 1 << (rank - 2));
const STRAIGHT = new Uint8Array(8192);
const TOP_FIVE = new Uint32Array(8192);
for (let mask = 1; mask < 8192; mask++) {
  let shift = 16;
  for (let rank = 14; rank >= 2; rank--) {
    if ((mask & (1 << (rank - 2))) && shift >= 0) {
      TOP_FIVE[mask] |= rank << shift;
      shift -= 4;
    }
  }
  for (let high = 14; high >= 6; high--) {
    const straight = 31 << (high - 6);
    if ((mask & straight) === straight) { STRAIGHT[mask] = high; break; }
  }
  if (!STRAIGHT[mask] && (mask & 0x100f) === 0x100f) STRAIGHT[mask] = 5;
}

const CARD_IDS = new Map<string, number>();
for (const [suitIndex, suit] of ["s", "h", "d", "c"].entries()) {
  for (const [rankIndex, rank] of ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].entries()) {
    CARD_IDS.set(rank + suit, suitIndex * 13 + rankIndex);
  }
}

export function encodeCard(card: string) {
  const id = CARD_IDS.get(card);
  if (id === undefined) throw new Error(`无效的扑克牌：${card}`);
  return id;
}

export function unpackScore(score: number): number[] {
  const category = score >>> 20;
  const lengths = [5, 4, 3, 3, 1, 5, 2, 2, 1];
  const result = [category];
  for (let index = 0; index < lengths[category]; index++) result.push((score >>> (16 - index * 4)) & 15);
  return result;
}

/** Reusable scratch space; each simulation owns its evaluator. */
export function createEvaluator() {
  const counts = new Uint8Array(15);
  const suits = new Uint16Array(4);
  let mask = 0;
  function add(card: number) {
    counts[CARD_RANK[card]]++;
    suits[CARD_SUIT[card]] |= CARD_BIT[card];
    mask |= CARD_BIT[card];
  }
  function reset(cards: ArrayLike<number>) {
    counts.fill(0);
    suits.fill(0);
    mask = 0;
    for (let index = 0; index < cards.length; index++) add(cards[index]);
  }
  function score() {
    let flush = 0;
    for (let suit = 0; suit < 4; suit++) {
      // The fifth packed rank is nonzero iff the suit has at least five cards.
      if (TOP_FIVE[suits[suit]] & 15) {
        flush = suits[suit];
        if (STRAIGHT[flush]) return (8 << 20) | (STRAIGHT[flush] << 16);
        break;
      }
    }
    let trip = 0;
    let pair = 0;
    let secondPair = 0;
    for (let rank = 14; rank >= 2; rank--) {
      const count = counts[rank];
      if (count === 4) return (7 << 20) | (rank << 16) | ((TOP_FIVE[mask & ~(1 << (rank - 2))] >>> 16) << 12);
      if (count === 3 && !trip) trip = rank;
      if (count >= 2) {
        if (!pair) pair = rank;
        else if (!secondPair) secondPair = rank;
      }
    }
    if (trip && (pair !== trip || secondPair)) return (6 << 20) | (trip << 16) | ((pair === trip ? secondPair : pair) << 12);
    if (flush) return (5 << 20) | TOP_FIVE[flush];
    if (STRAIGHT[mask]) return (4 << 20) | (STRAIGHT[mask] << 16);
    if (trip) return (3 << 20) | (trip << 16) | ((TOP_FIVE[mask & ~(1 << (trip - 2))] >>> 4) & 0xff00);
    if (secondPair) return (2 << 20) | (pair << 16) | (secondPair << 12) | ((TOP_FIVE[mask & ~(1 << (pair - 2)) & ~(1 << (secondPair - 2))] >>> 16) << 8);
    if (pair) return (1 << 20) | (pair << 16) | ((TOP_FIVE[mask & ~(1 << (pair - 2))] >>> 4) & 0xfff0);
    return TOP_FIVE[mask];
  }
  return {
    evaluate(cards: ArrayLike<number>) { reset(cards); return score(); },
    setBoard: reset,
    // Evaluate a pair against the already prepared board without rebuilding it.
    pair(first: number, second: number) {
      const oldMask = mask;
      const firstSuit = CARD_SUIT[first];
      const secondSuit = CARD_SUIT[second];
      const oldFirstSuit = suits[firstSuit];
      const oldSecondSuit = suits[secondSuit];
      add(first);
      add(second);
      const result = score();
      counts[CARD_RANK[first]]--;
      counts[CARD_RANK[second]]--;
      suits[firstSuit] = oldFirstSuit;
      suits[secondSuit] = oldSecondSuit;
      mask = oldMask;
      return result;
    },
  };
}
