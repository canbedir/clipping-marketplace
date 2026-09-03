export function violatedConstraint(error: unknown): string | null {
  let current: unknown = error;
  while (current instanceof Error) {
    const constraint = (current as { constraint?: unknown }).constraint;
    if (typeof constraint === "string") return constraint;
    current = current.cause;
  }
  return null;
}
