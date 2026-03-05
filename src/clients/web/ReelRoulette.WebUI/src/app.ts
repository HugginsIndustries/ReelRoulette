import type { RuntimeConfig } from "./types/runtimeConfig";

function renderConfigSummary(config: RuntimeConfig): string {
  return `
    <section class="card">
      <h2>Runtime Configuration</h2>
      <dl class="grid">
        <dt>API Base URL</dt>
        <dd><code>${config.apiBaseUrl}</code></dd>
        <dt>SSE URL</dt>
        <dd><code>${config.sseUrl}</code></dd>
      </dl>
    </section>
  `;
}

export function renderApp(container: HTMLElement, config: RuntimeConfig): void {
  container.innerHTML = `
    <main>
      <h1>ReelRoulette WebUI</h1>
      <p>
        The web client is running independently and resolves API/SSE endpoints from runtime configuration.
      </p>
      ${renderConfigSummary(config)}
      <section class="card">
        <h2>Health Check</h2>
        <p id="health-output">Not started</p>
        <button id="health-button" type="button">Check /health</button>
      </section>
    </main>
  `;

  const healthButton = container.querySelector<HTMLButtonElement>("#health-button");
  const healthOutput = container.querySelector<HTMLParagraphElement>("#health-output");
  if (!healthButton || !healthOutput) {
    return;
  }

  healthButton.addEventListener("click", async () => {
    healthOutput.textContent = "Checking...";
    try {
      const url = new URL("/health", config.apiBaseUrl).toString();
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        healthOutput.textContent = `Health endpoint returned HTTP ${response.status}.`;
        return;
      }

      const body = await response.text();
      healthOutput.textContent = `OK: ${body}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      healthOutput.textContent = `Health check failed: ${message}`;
    }
  });
}

export function renderStartupError(container: HTMLElement, message: string): void {
  container.innerHTML = `
    <main>
      <h1>ReelRoulette WebUI</h1>
      <section class="card error">
        <h2>Runtime Configuration Error</h2>
        <p>${message}</p>
        <p>
          Provide \`window.__REEL_ROULETTE_RUNTIME_CONFIG\` before boot, or host a valid
          \`/runtime-config.json\`.
        </p>
      </section>
    </main>
  `;
}
