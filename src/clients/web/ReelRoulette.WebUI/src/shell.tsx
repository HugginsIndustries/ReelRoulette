import { render } from "preact";
import { createAppServices } from "./state/appServices";
import type { RuntimeConfig } from "./types/runtimeConfig";
import { App, StartupError } from "./ui/App";

/** Mounts the WebUI into `container`. Returns a function that unmounts it. */
export function renderApp(container: HTMLElement, config: RuntimeConfig): () => void {
  render(<App services={createAppServices(config)} />, container);
  return () => render(null, container);
}

export function renderStartupError(container: HTMLElement, message: string): void {
  render(<StartupError message={message} />, container);
}
