// Deliberately independent five-card enumeration oracle for engine validation.
const rankValue = (card: string) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].indexOf(card.slice(0, -1)) + 2;

export function compareReference(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function fiveCardReference(cards: string[]) {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.slice(-1) === cards[0].slice(-1));
  const unique = [...counts.keys()].sort((a, b) => b - a);
  const straightHigh = unique.length === 5
    ? unique[0] - unique[4] === 4 ? unique[0] : unique.join(",") === "14,5,4,3,2" ? 5 : 0
    : 0;
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.filter((group) => group[1] === 1).map((group) => group[0])];
  const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]).sort((a, b) => b - a);
  if (pairs.length === 2) return [2, pairs[0], pairs[1], groups.find((group) => group[1] === 1)![0]];
  if (pairs.length === 1) return [1, pairs[0], ...groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a)];
  return [0, ...values];
}

export function evaluateReference(cards: string[]) {
  let best: number[] = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const score = fiveCardReference([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best.length || compareReference(score, best) > 0) best = score;
          }
  return best;
}
