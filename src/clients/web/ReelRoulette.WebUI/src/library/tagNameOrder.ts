function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Display order for tag and category names; mirrors the server and desktop comparison. */
export function compareTagNames(a: unknown, b: unknown): number {
  // Lower-case before comparing codes so "_" and other ASCII punctuation between "Z" and "a" sort before letters.
  // Matches the server and desktop copy only for ASCII names: toLowerCase and .NET ToLowerInvariant differ on some
  // non-ASCII letters, for example a final sigma.
  const left = String(a ?? "");
  const right = String(b ?? "");
  return compareCodeUnits(left.toLowerCase(), right.toLowerCase()) || compareCodeUnits(left, right);
}
