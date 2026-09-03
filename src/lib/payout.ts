export function earningsForViews(views: number, payoutPer1kViews: number): number {
  if (views < 0 || payoutPer1kViews < 0) {
    throw new RangeError("views and payout rate must be non-negative");
  }
  return Math.floor(views / 1000) * payoutPer1kViews;
}

export function remainingBudget(totalBudget: number, spent: number): number {
  return Math.max(0, totalBudget - spent);
}

export function allocatable(desired: number, remaining: number): number {
  return Math.max(0, Math.min(desired, remaining));
}
