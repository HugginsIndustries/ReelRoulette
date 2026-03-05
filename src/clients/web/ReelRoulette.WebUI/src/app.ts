import type { RuntimeConfig } from "./types/runtimeConfig";
import { bootstrapAuthSession } from "./auth/authBootstrap";
import { createSseClient } from "./events/sseClient";

function renderConfigSummary(config: RuntimeConfig): string {
  const pairTokenSummary = config.pairToken ? "provided (runtime config)" : "not set";

  return `
    <section class="card">
      <h2>Runtime Configuration</h2>
      <dl class="grid">
        <dt>API Base URL</dt>
        <dd><code>${config.apiBaseUrl}</code></dd>
        <dt>SSE URL</dt>
        <dd><code>${config.sseUrl}</code></dd>
        <dt>Pair Token</dt>
        <dd><code>${pairTokenSummary}</code></dd>
      </dl>
    </section>
  `;
}

export function renderApp(container: HTMLElement, config: RuntimeConfig): void {
  container.innerHTML = `
    <main>
      <h1>ReelRoulette WebUI</h1>
      <p>
        Direct web-to-core auth/session and SSE reliability bootstrap for M7b.
      </p>
      ${renderConfigSummary(config)}
      <section class="card">
        <h2>Auth Session</h2>
        <p id="auth-status">Not paired</p>
        <div class="inline-controls">
          <input id="pair-token-input" placeholder="Pair token" />
          <button id="pair-button" type="button">Pair + Connect</button>
        </div>
      </section>
      <section class="card">
        <h2>SSE Connection</h2>
        <p id="connection-status">Disconnected</p>
      </section>
      <section class="card">
        <h2>Refresh Status</h2>
        <p id="refresh-status">Not synced</p>
      </section>
      <section class="card">
        <h2>Health Check</h2>
        <p id="health-output">Not started</p>
        <button id="health-button" type="button">Check /health</button>
      </section>
    </main>
  `;

  const healthButton = container.querySelector<HTMLButtonElement>("#health-button");
  const healthOutput = container.querySelector<HTMLParagraphElement>("#health-output");
  const pairButton = container.querySelector<HTMLButtonElement>("#pair-button");
  const pairTokenInput = container.querySelector<HTMLInputElement>("#pair-token-input");
  const authStatus = container.querySelector<HTMLParagraphElement>("#auth-status");
  const connectionStatus = container.querySelector<HTMLParagraphElement>("#connection-status");
  const refreshStatus = container.querySelector<HTMLParagraphElement>("#refresh-status");
  if (
    !healthButton ||
    !healthOutput ||
    !pairButton ||
    !pairTokenInput ||
    !authStatus ||
    !connectionStatus ||
    !refreshStatus
  ) {
    return;
  }

  pairTokenInput.value = config.pairToken ?? "";
  const sseClient = createSseClient(config, {
    setConnectionStatus: (message) => {
      connectionStatus.textContent = message;
    },
    setRefreshStatus: (message) => {
      refreshStatus.textContent = message;
    }
  });

  const connectFromLifecycle = (): void => {
    if (authStatus.textContent?.startsWith("Authorized")) {
      sseClient.connect("lifecycle");
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      connectFromLifecycle();
    }
  });
  window.addEventListener("focus", connectFromLifecycle);
  window.addEventListener("pageshow", connectFromLifecycle);
  window.addEventListener("online", connectFromLifecycle);
  window.addEventListener("beforeunload", () => sseClient.stop());

  pairButton.addEventListener("click", async () => {
    pairButton.disabled = true;
    authStatus.textContent = "Authorizing...";
    try {
      const token = pairTokenInput.value.trim();
      const result = await bootstrapAuthSession(config, token.length > 0 ? token : undefined);
      if (!result.authorized) {
        authStatus.textContent = result.message;
        return;
      }

      const version = result.version ? `API ${result.version.apiVersion}` : "API unknown";
      authStatus.textContent = `Authorized (${version}). ${result.message}`;
      sseClient.connect("pair");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown auth error";
      authStatus.textContent = `Auth failed: ${message}`;
    } finally {
      pairButton.disabled = false;
    }
  });

  healthButton.addEventListener("click", async () => {
    healthOutput.textContent = "Checking...";
    try {
      const url = new URL("/health", config.apiBaseUrl).toString();
      const response = await fetch(url, { method: "GET", credentials: "include" });
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

  // Attempt first auth/bootstrap pass with runtime-provided token.
  void pairButton.click();
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
