import { renderApp, renderStartupError } from "./shell";
import { loadRuntimeConfig } from "./config/runtimeConfig";
import "./styles.css";

function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  if (typeof window === "undefined" || !window.isSecureContext) {
    return;
  }
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Non-fatal: unsupported, blocked, or non-HTTPS (except localhost).
  });
}

registerServiceWorker();

function syncSystemThemeClass(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.remove("theme-dark", "theme-light");
  root.classList.add(dark ? "theme-dark" : "theme-light");
}

syncSystemThemeClass();
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncSystemThemeClass);
}

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    throw new Error("App root '#app' not found.");
  }

  try {
    const config = await loadRuntimeConfig();
    renderApp(root, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup failure";
    renderStartupError(root, message);
  }
}

void bootstrap();
