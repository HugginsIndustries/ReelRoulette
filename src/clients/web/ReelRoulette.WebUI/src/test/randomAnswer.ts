/**
 * A `POST /api/random` answer: the picked item, or null when nothing is eligible, with this device's cycle numbers.
 * `POST /api/play/{itemId}` answers with the item alone, so item fixtures stay unwrapped.
 */
export function randomAnswer(item: unknown): Response {
  const cycle = { picked: item ? 1 : 0, eligible: item ? 1 : 0, remaining: 0 };
  return new Response(JSON.stringify({ item, cycle }), { headers: { "Content-Type": "application/json" } });
}
