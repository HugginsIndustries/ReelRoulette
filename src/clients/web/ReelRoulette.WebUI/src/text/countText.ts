/** A count and its noun, the number grouped as the device writes numbers: "1 item", "1,234 items", or "2 tags". */
export function countText(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}
