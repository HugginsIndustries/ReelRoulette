import { renderApp, renderStartupError } from "./app";
import { loadRuntimeConfig } from "./config/runtimeConfig";
import "./styles.css";

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
