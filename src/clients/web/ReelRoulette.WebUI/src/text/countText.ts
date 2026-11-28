/** A count and its noun, the number grouped as the device writes numbers: "1 item", "1,234 items", or "2 tags". */
export function countText(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * How far through a count, both numbers grouped as `countText` groups them, with the noun counted by the total:
 * "1,234 of 49,455 files", "1 of 1 file", or "2 of 3" without one.
 */
export function ofText(done: number, total: number, noun?: string): string {
  const of = `${done.toLocaleString()} of ${total.toLocaleString()}`;
  return noun ? `${of} ${noun}${total === 1 ? "" : "s"}` : of;
}
