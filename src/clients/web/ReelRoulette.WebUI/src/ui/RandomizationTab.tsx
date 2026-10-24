import { REMEMBER_PLAYS_FOR, type RandomBehavior, type RandomOptions, type RememberPlaysFor } from "../random/randomOptions";
import type { CategoryListView, CycleCardView } from "../random/randomizationTab";
import { isFlagged } from "../validation/fieldValidation";
import { useApp } from "./appContext";
import { useFieldValidation } from "./FieldValidation";
import { Checkbox, Choices, OptionList, Section, type Choice } from "./SettingControls";
import { StatCards, StatCardsMessage } from "./StatCards";

type FavorOption = "favorLessPlayed" | "favorNewlyAdded" | "favorNewlyCreated" | "favorHigherRated";

const FAVOR_CHOICES: readonly Choice<FavorOption>[] = [
  { value: "favorLessPlayed", title: "Less played", description: "Files played less, or not lately, come up more often." },
  { value: "favorNewlyAdded", title: "Newly added", description: "Recently added files get a share of the picks, newer ones more often." },
  { value: "favorNewlyCreated", title: "Newly created", description: "Recently created files get a share of the picks, newer ones more often." },
  { value: "favorHigherRated", title: "Higher rated", description: "Higher-rated files come up more often. An unrated file counts as 2.5 stars." }
];

const BEHAVIOR_CHOICES: readonly Choice<RandomBehavior>[] = [
  { value: "jump", title: "Jump", description: "Adds the pick at the end of the history." },
  { value: "insert", title: "Insert", description: "Puts the pick right after the current item, keeping the plays ahead after it." }
];

/** Remember plays for's value in its dropdown: the days, or "all" for until everything has played. */
function windowValue(days: RememberPlaysFor): string {
  return days === null ? "all" : String(days);
}

/**
 * The panel's Randomization tab, as the mockup lays it out: the Shuffle cycle card, then Shuffle with Remember plays
 * for and Reset now, Spread, Favor, and Random behavior. Each option applies at once and is kept on this device.
 */
export function RandomizationTab() {
  const { store, randomization } = useApp();
  const options = store.randomOptions.value;
  const view = randomization.view.value;
  const set = (change: Partial<RandomOptions>) => randomization.setOptions(change);
  return (
    <div id="randomization-tab" class="settings-tab">
      <div class="settings-tab-header">
        <h2>Randomization</h2>
      </div>
      <div id="randomization-body" class="settings-body themed-scrollbar">
        <section class="stats-section" aria-labelledby="randomization-cycle-heading">
          <details
            class="setting-more shortcuts-more"
            id="randomization-cycle"
            open={randomization.cycleOpen.value}
            onToggle={(event) => randomization.setCycleOpen(event.currentTarget.open)}
          >
            <summary>
              <span class="material-symbol-icon setting-more-chevron" aria-hidden="true">chevron_right</span>
              <h3 id="randomization-cycle-heading">Shuffle cycle</h3>
            </summary>
            <div id="randomization-cycle-body" class="cycle-body">
              <CycleCard cycle={view.cycle} />
            </div>
          </details>
        </section>
        <Section id="randomization-shuffle" title="Shuffle">
          <Checkbox
            id="randomization-shuffle-on"
            label="Shuffle"
            hint="Nothing repeats until everything has played, or until Remember plays for has passed."
            checked={options.shuffle}
            onChange={(shuffle) => set({ shuffle })}
          />
          <div class="setting">
            <label class="setting-label" for="randomization-window">
              Remember plays for
            </label>
            <select
              class="ctl"
              id="randomization-window"
              value={windowValue(options.rememberPlaysForDays)}
              onChange={(event) => {
                const choice = REMEMBER_PLAYS_FOR.find((entry) => windowValue(entry.value) === event.currentTarget.value);
                if (choice) {
                  set({ rememberPlaysForDays: choice.value });
                }
              }}
            >
              {REMEMBER_PLAYS_FOR.map((choice) => (
                <option key={windowValue(choice.value)} value={windowValue(choice.value)}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <div class="setting">
            <button
              class="btn"
              type="button"
              id="randomization-reset"
              disabled={view.resetBlockedReason !== null}
              title={view.resetBlockedReason ?? undefined}
              onClick={() => void randomization.reset()}
            >
              Reset now
            </button>
            <p class="setting-hint">Forgets this device's picks and starts a new cycle.</p>
          </div>
        </Section>
        <Section id="randomization-spread" title="Spread">
          <Checkbox
            id="randomization-spread-folder"
            label="Spread by folder"
            hint="Skips the folders of recent picks."
            checked={options.spreadByFolder}
            onChange={(spreadByFolder) => set({ spreadByFolder })}
          />
          <Checkbox
            id="randomization-spread-tags"
            label="Spread by tags"
            hint="Files that share tags with recent picks come up less, rarer tags more so."
            checked={options.spreadByTags}
            onChange={(spreadByTags) => set({ spreadByTags })}
          >
            <TagSpreadFields />
          </Checkbox>
        </Section>
        <Section id="randomization-favor" title="Favor">
          <OptionList
            id="randomization-favor"
            labelledBy="randomization-favor-heading"
            type="checkbox"
            choices={FAVOR_CHOICES}
            isChecked={(option) => options[option]}
            onChange={(option, checked) => set({ [option]: checked })}
          />
        </Section>
        <Section id="randomization-behavior-section" title="Random behavior">
          <Choices
            id="randomization-behavior"
            labelledBy="randomization-behavior-section-heading"
            choices={BEHAVIOR_CHOICES}
            value={store.randomBehavior.value}
            onChange={(behavior) => store.setRandomBehavior(behavior)}
            hint="For the player's Random button and R."
          />
        </Section>
        <p class="setting-hint">Options apply at once and are kept on this device.</p>
      </div>
    </div>
  );
}

/**
 * The cycle card's cards, with what they count under them, and while Shuffle is off that files can repeat; or a
 * message in their place.
 */
function CycleCard({ cycle }: { cycle: CycleCardView }) {
  if (cycle.kind === "message") {
    return <StatCardsMessage text={cycle.text} />;
  }
  if (cycle.kind === "none") {
    return null;
  }
  return (
    <>
      <StatCards cards={cycle.cards} />
      <p class="setting-hint">On this device. A server restart starts a new cycle.</p>
      {cycle.shuffleOff ? <p class="setting-hint">Shuffle is off, so files can repeat.</p> : null}
    </>
  );
}

/**
 * All tags and By category, disabled while Spread by tags is off, and By category's list, shown while it is chosen.
 * By category with no category chosen is flagged, and nothing else is held, since the options apply at once.
 */
function TagSpreadFields() {
  const { store, randomization } = useApp();
  const options = store.randomOptions.value;
  const view = randomization.view.value;
  const byCategory = useFieldValidation<HTMLInputElement>({ problem: view.byCategoryProblem, flagged: isFlagged(view.byCategoryProblem) });
  return (
    <fieldset class="setting-fields setting-sub" id="randomization-tag-fields" disabled={!options.spreadByTags}>
      <div class="choice-stack">
        <label>
          <input
            type="radio"
            name="randomization-tag-spread"
            value="allTags"
            checked={options.tagSpread === "allTags"}
            onChange={() => randomization.setOptions({ tagSpread: "allTags" })}
          />
          <span>All tags</span>
        </label>
        <span class="vfield vfield-after">
          <label>
            <input
              {...byCategory.control}
              type="radio"
              id="randomization-by-category"
              name="randomization-tag-spread"
              value="byCategory"
              checked={options.tagSpread === "byCategory"}
              onChange={() => randomization.setOptions({ tagSpread: "byCategory" })}
            />
            <span>By category</span>
          </label>
          {byCategory.mark}
        </span>
        <div class="setting-sub" id="randomization-categories" hidden={options.tagSpread !== "byCategory"}>
          <CategoryList list={view.categories} />
        </div>
      </div>
    </fieldset>
  );
}

/** The categories with tags, in the tag catalog's order, each chosen by its id, or why they can't be listed. */
function CategoryList({ list }: { list: CategoryListView }) {
  const { randomization } = useApp();
  if (list.kind === "none") {
    return null;
  }
  if (list.kind === "failed") {
    return <p class="filter-hint is-error">{list.text}</p>;
  }
  if (list.categories.length === 0) {
    return <p class="filter-hint">No tags yet. Add them in the Tags tab.</p>;
  }
  return (
    <div class="choice-row" id="randomization-category-list">
      {list.categories.map((category) => (
        <label key={category.id}>
          <input
            type="checkbox"
            value={category.id}
            checked={category.chosen}
            onChange={(event) => randomization.setCategoryChosen(category.id, event.currentTarget.checked)}
          />{" "}
          {category.name}
        </label>
      ))}
    </div>
  );
}
