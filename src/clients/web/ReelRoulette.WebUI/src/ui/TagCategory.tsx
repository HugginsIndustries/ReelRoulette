import type { ComponentChildren, Ref } from "preact";
import { useRef } from "preact/hooks";
import { useMenuSurface } from "./Menu";
import type { MenuGroups } from "./menuModel";

export interface TagCategoryProps {
  name: string;
  collapsed: boolean;
  /** How many of its tags are in use, shown while above 0. */
  inUse: number;
  /** Says what `inUse` counts, such as "2 tags on this item". */
  inUseTitle: string;
  /** It holds unsaved changes, which the orange dot shows. */
  unsaved: boolean;
  onToggle: () => void;
  /** Its drag handle, before its name. */
  handle?: ComponentChildren;
  /** Its own controls, after its name, which keep their own actions. */
  controls?: ComponentChildren;
  /** Its header's menu, which a right-click or a long press on the header, its name included, opens; none without. */
  menu?: () => MenuGroups;
  /** The section's class, which says while it is being dragged. */
  class?: string;
  sectionRef?: Ref<HTMLElement>;
  children: ComponentChildren;
}

/**
 * A tag category, in the Tags tab and the Filter tab's Tags section: a header whose name toggles it, as does a tap on
 * the header's own padding, and its tags. Its drag handle and its controls keep their own actions, and a press on them
 * let go elsewhere on the header doesn't toggle it. Expanded or collapsed, the header shows how many of its tags are
 * in use while any are, and the orange dot while it holds unsaved changes, and its toggle's name says both while they
 * show. With a menu, a long press on its name opens the menu, as on the rest of the header, in place of the name's
 * tooltip.
 */
export function TagCategory(props: TagCategoryProps) {
  const { collapsed, inUse, unsaved } = props;
  /** Whether the last press on the header started on the header itself, or null before any press. */
  const pressOnHeader = useRef<boolean | null>(null);
  const header = useRef<HTMLDivElement>(null);
  useMenuSurface(header, props.menu, { pressOn: ".tag-category-toggle" });
  const showCount = inUse > 0;
  const showDot = unsaved;
  const label = [props.name, showCount ? props.inUseTitle : null, showDot ? "unsaved changes" : null].filter(Boolean).join(", ");
  const classes = ["tag-category", collapsed ? "is-collapsed" : null, props.class].filter(Boolean).join(" ");
  return (
    <section class={classes} ref={props.sectionRef}>
      <div
        class={props.menu ? "tag-category-header menu-surface" : "tag-category-header"}
        ref={header}
        onPointerDown={(event) => {
          pressOnHeader.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          // A press and a release on different parts of the header, such as a drag's drop with the pointer on the name,
          // click the header itself, so only a press that started on its padding toggles it.
          const startedOnHeader = pressOnHeader.current;
          pressOnHeader.current = null;
          if (event.target === event.currentTarget && startedOnHeader !== false) {
            props.onToggle();
          }
        }}
      >
        {props.handle}
        <button type="button" class="tag-category-toggle" aria-label={label} title={collapsed ? "Expand category" : "Collapse category"} onClick={props.onToggle}>
          <span class="tag-category-name">{props.name}</span>
          <span class="category-count" title={props.inUseTitle} hidden={!showCount}>{inUse}</span>
          <span class="unsaved-dot category-dot" title="Unsaved changes" hidden={!showDot}></span>
        </button>
        {props.controls}
      </div>
      <div class="tag-grid" hidden={collapsed}>
        {props.children}
      </div>
    </section>
  );
}

/** "1 tag" or "{n} tags", then what they are in use by. */
export function tagsInUse(count: number, where: string): string {
  return `${count} ${count === 1 ? "tag" : "tags"} ${where}`;
}
