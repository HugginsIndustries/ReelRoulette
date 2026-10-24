/** What a test file's tests stubbed, each undone after the test, newest first, by the file's own tests. */
export type Restores = Array<() => void>;

/** Defines `name` on `target` for a test, and records in `restores` how to put back what was there. */
export function stubProperty(restores: Restores, target: object, name: string, descriptor: PropertyDescriptor): void {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  restores.push(() => {
    if (original) {
      Object.defineProperty(target, name, original);
    } else {
      delete (target as Record<string, unknown>)[name];
    }
  });
}

/**
 * Makes `matchMedia` report each query that names `feature`, such as "prefers-reduced-motion: reduce", as matching,
 * which happy-dom's never does, and answer other queries as before, recording in `restores` how to undo it. The
 * stylesheet's own rules for the feature still don't apply.
 */
export function stubMatchingMediaQuery(restores: Restores, feature: string): void {
  const real = window.matchMedia.bind(window);
  stubProperty(restores, window, "matchMedia", {
    value(query: string) {
      if (!query.includes(feature)) {
        return real(query);
      }
      return { matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
    }
  });
}
