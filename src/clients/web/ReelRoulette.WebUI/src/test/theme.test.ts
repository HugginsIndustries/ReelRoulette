import { describe, expect, it } from "vitest";
import { isThemeChoice, resolveTheme, THEME_CHOICES, THEME_META } from "../settings/theme";

describe("resolveTheme", () => {
  it("gives the system's scheme for System, and Dark or Light whatever the system says", () => {
    expect([resolveTheme("system", true), resolveTheme("system", false)]).toEqual(["dark", "light"]);
    expect([resolveTheme("dark", false), resolveTheme("light", true)]).toEqual(["dark", "light"]);
  });
});

describe("isThemeChoice", () => {
  it("takes System, Dark, and Light only", () => {
    expect(THEME_CHOICES.every(isThemeChoice)).toBe(true);
    expect(["sepia", "", null, 1, "Dark"].some(isThemeChoice)).toBe(false);
  });
});

describe("THEME_META", () => {
  it("gives each theme its page background, and dark status bar text only to the light theme", () => {
    expect(THEME_META).toEqual({
      dark: { color: "#1a1a1a", statusBarStyle: "black-translucent" },
      light: { color: "#eceff4", statusBarStyle: "default" }
    });
  });
});
