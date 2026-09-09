/** P excludes the pending call: EV = equity * (P + call) - call. */
export function breakEvenCallAmount(pot: number, equityPercent: number): number | null {
  // At 100% equity EV equals P regardless of the call, so there is no
  // unique break-even amount (all amounts break even when P is zero).
  return equityPercent >= 100 ? null : pot * equityPercent / (100 - equityPercent);
}
