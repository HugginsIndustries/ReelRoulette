/** Reasons the server gives in a refusal's `{ "error": ... }` body, word for word, for tests that fake one. */

/** Any request from another device while the server's remote connections are off (403). */
export const REMOTE_CONNECTIONS_OFF =
  "Remote connections are turned off on this ReelRoulette server. Turn on Allow remote connections in the Operator on the server machine.";

/** A favorite, blacklist, rating, or Show in File Manager for an item the catalog no longer holds (404). */
export const FILE_NOT_IN_LIBRARY = "The file is no longer in the library.";

/** A random pick from a library with no files (503). */
export const LIBRARY_EMPTY = "The library is empty.";

/** A pairing with a token that isn't the server's (401). */
export const PAIRING_TOKEN_WRONG = "The pairing token is wrong.";

/** A preset reorder that doesn't name every preset the server has, as after another device changed them (409). */
export const PRESETS_CHANGED = "The presets changed since they were loaded.";

/** A preset update, rename, or delete for an id no preset has, as after another device deleted it (404). */
export const PRESET_GONE = "That preset no longer exists.";

/** A tag rename or delete for a tag the catalog doesn't have (409). */
export function noTagNamed(name: string): string {
  return `There's no tag named "${name}".`;
}
