export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const candidate = current as { code?: unknown; constraint?: unknown };
    if (candidate.code === "23505") {
      return constraint === undefined || candidate.constraint === constraint;
    }
    current = current.cause;
  }
  return false;
}
