import type { StatsCard } from "../stats/statsModel";

/** Cards of numbers, each a value over its label, as the Stats tab's Library and the Randomization tab's cycle card show them. */
export function StatCards({ cards }: { cards: readonly StatsCard[] }) {
  return (
    <div class="stats-grid">
      {cards.map((card) => (
        <div key={card.label} class="stat-card">
          <div class="value">{card.value}</div>
          <div class="label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

/** A message in place of the cards, such as why they couldn't load. */
export function StatCardsMessage({ text }: { text: string }) {
  return (
    <p class="filter-hint is-error">{text}</p>
  );
}
