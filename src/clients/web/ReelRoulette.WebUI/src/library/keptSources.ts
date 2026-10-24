import { sourceLabel, type FilterSource } from "../filter/filterDialogModel";
import { countText } from "../text/countText";

/** A source a refresh kept the library's items from, because its folder listed no media files. */
export interface KeptSourceFolder {
  source: FilterSource;
  /** How many of the library's items from it were kept. */
  itemCount: number;
}

/** The kept-source notice's `last.log` text, which names no folder, since relayed lines carry no paths. */
export const KEPT_SOURCES_LOG_TEXT = "Library refresh kept the items of sources whose folder listed no media files";

/** "a", "a and b", or "a, b and c". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The notice for sources a refresh kept, each named as the Filter tab labels it, with the kept items counted together.
 */
export function keptSourcesMessage(kept: readonly KeptSourceFolder[]): string {
  const sources = joinNames(kept.map((entry) => sourceLabel(entry.source)));
  const total = kept.reduce((sum, entry) => sum + entry.itemCount, 0);
  const items = countText(total, "item");
  if (kept.length === 1) {
    return `Library refresh found no media files in ${sources}, so it kept the library's ${items} from there. If the folder is on a drive or share, check that it's connected.`;
  }
  return `Library refresh found no media files in ${sources}, so it kept the library's ${items} from them. If the folders are on a drive or share, check that it's connected.`;
}
