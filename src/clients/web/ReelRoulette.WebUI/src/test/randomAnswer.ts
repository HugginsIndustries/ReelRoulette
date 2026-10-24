import type { RandomCycle } from "../state/appStore";

/**
 * A `POST /api/random` answer: the picked item, or null when nothing is eligible, with this device's cycle numbers,
 * by default one picked of one eligible with a pick and none without. `POST /api/play/{itemId}` answers with the item
 * alone, so item fixtures stay unwrapped.
 */
export function randomAnswer(item: unknown, cycle: RandomCycle = answerCycle(item)): Response {
  return new Response(JSON.stringify({ item, cycle }), { headers: { "Content-Type": "application/json" } });
}

/** The cycle numbers `randomAnswer` gives by default. */
export function answerCycle(item: unknown): RandomCycle {
  return { picked: item ? 1 : 0, eligible: item ? 1 : 0, remaining: 0 };
}
