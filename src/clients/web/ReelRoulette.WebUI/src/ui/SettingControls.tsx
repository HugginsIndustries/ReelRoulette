import { Fragment, type ComponentChildren } from "preact";

/** One choice of a group of radio buttons: its name, and a line under it when the name needs one. */
export interface Choice<T extends string> {
  value: T;
  title: string;
  description?: string;
}

/** A section of a settings-style tab under its heading, whose id, `{id}-heading`, can name a group of choices in it. */
export function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="settings-section">
      <h3 id={`${id}-heading`}>{title}</h3>
      {children}
    </section>
  );
}

/**
 * A labeled list of radio buttons, for one value, or checkboxes, for each of a set. Each is named by its choice's title
 * alone, with its line, when it has one, under the title. A choice may have more after it, such as the field it shows.
 * Without a label of its own, the group is named by `labelledBy`, such as its section's heading.
 */
export function OptionList<T extends string>(props: {
  id: string;
  label?: string;
  labelledBy?: string;
  type: "radio" | "checkbox";
  choices: readonly Choice<T>[];
  isChecked: (value: T) => boolean;
  onChange: (value: T, checked: boolean) => void;
  disabled?: boolean;
  after?: Partial<Record<T, ComponentChildren>>;
}) {
  const { id, label, labelledBy, type, choices, isChecked, onChange, disabled, after } = props;
  const stacked = choices.some((choice) => choice.description);
  return (
    <>
      {label === undefined ? null : <span class="setting-label" id={`${id}-label`}>{label}</span>}
      <div
        class={stacked ? "choice-stack" : "choice-row"}
        role={type === "radio" ? "radiogroup" : "group"}
        aria-labelledby={label === undefined ? labelledBy : `${id}-label`}
      >
        {choices.map((choice) => {
          const input = {
            name: id,
            value: choice.value,
            checked: isChecked(choice.value),
            disabled,
            "aria-labelledby": `${id}-${choice.value}`,
            onChange: (event: Event) => onChange(choice.value, (event.currentTarget as HTMLInputElement).checked)
          };
          return (
            <Fragment key={choice.value}>
              <label>
                {type === "radio" ? <input type="radio" {...input} /> : <input type="checkbox" {...input} />}
                <span>
                  <span id={`${id}-${choice.value}`}>{choice.title}</span>
                  {choice.description ? <small>{choice.description}</small> : null}
                </span>
              </label>
              {after?.[choice.value] ?? null}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}

/** Radio buttons for one setting, as an `OptionList`, with a hint under them when it has one. */
export function Choices<T extends string>(props: {
  id: string;
  label?: string;
  labelledBy?: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const { value, onChange, hint, ...list } = props;
  return (
    <div class="setting">
      <OptionList
        {...list}
        type="radio"
        isChecked={(choice) => choice === value}
        onChange={(choice) => onChange(choice)}
      />
      {hint ? <p class="setting-hint">{hint}</p> : null}
    </div>
  );
}

/** A setting that is on or off, with a hint under it, when it has one, and its own fields under that, when it has any. */
export function Checkbox(props: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  children?: ComponentChildren;
}) {
  const { id, label, hint, checked, onChange, children } = props;
  return (
    <div class="setting">
      <div class="choice-row">
        <label>
          <input type="checkbox" id={id} checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
          {label}
        </label>
      </div>
      {hint ? <p class="setting-hint">{hint}</p> : null}
      {children}
    </div>
  );
}
