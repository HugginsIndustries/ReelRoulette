# M7 Clarifications and Final Decisions

This document captures finalized M7 clarification choices so implementation can proceed without re-deciding scope. It summarizes the previously selected decisions (1-9) plus additional operational clarifications (10-14), renumbered into one canonical list.

## Final Decisions (1-14)

### 1) Web Hosting Topology

- **Chosen option**: Separate web host (independent from desktop host and core process).
- **Decision detail**: The web app is served by its own static host/runtime and connects directly to core API/SSE endpoints.
- **Reasoning**: Matches the goals of independent updates, quicker web iteration, and avoiding desktop/core rebuild/restart for web changes.

### 2) Web Build/Toolchain

- **Chosen option**: Vite + TypeScript.
- **Decision detail**: Build `src/clients/web/ReelRoulette.WebUI` as a TS-first Vite project, with clear API and SSE client modules.
- **Reasoning**: Provides fast HMR/dev loops, standard production output, and maintainable structure for future parity with desktop/mobile clients.

### 3) Zero-Restart Web Deployment

- **Chosen option**: Versioned folder + atomic switch.
- **Decision detail**: Publish each web build as an immutable versioned artifact; switch active version atomically (pointer/symlink/current manifest).
- **Reasoning**: Enables no-downtime updates and safe roll-forward/roll-back without restarting desktop or core.

### 4) API Endpoint Resolution

- **Chosen option**: Runtime config.
- **Decision detail**: Web app reads base API/SSE URLs from runtime-injected config (not compile-time hardcoded values).
- **Reasoning**: Allows environment/host changes without rebuilding the web bundle and supports independent deployments.

### 5) Auth/Pairing Session Model

- **Chosen option**: Pair token -> secure session cookie.
- **Decision detail**: Use pairing token for initial trust bootstrap, then issue/maintain secure HTTP-only session cookie for ongoing API/SSE use.
- **Reasoning**: Improves security and reconnect behavior versus long-lived client-stored bearer tokens.

### 6) SSE Reconnect/Resync Strategy

- **Chosen option**: Revision + replay + authoritative requery fallback.
- **Decision detail**: Clients reconnect with revision/Last-Event-ID, consume replay when available, and re-fetch authoritative state on replay gaps/resync-required.
- **Reasoning**: Preserves thin-client correctness and reduces long-lived drift between clients.

### 7) Compatibility Policy for Independent Releases

- **Chosen option**: N/N-1 compatibility + capability checks.
- **Decision detail**: Web client must support current and previous compatible server contract versions; feature-gate by server capabilities where needed.
- **Reasoning**: Supports independent web release cadence while minimizing breakage risk during staged server upgrades.

### 8) Legacy WebRemote Cutover

- **Chosen option**: Two-phase with feature flag.
- **Decision detail**:

  1. Ship parity-capable independent web path behind migration flag(s).
  2. Make independent path default, then remove legacy embedded mutation/event bridge paths.

- **Reasoning**: Reduces blast radius and provides rollback while converging on M7 final state.

### 9) Verification Model

- **Chosen option**: Automated + manual hybrid gate.
- **Decision detail**: Keep CI validation for contracts/build/SSE semantics plus focused manual checks for UX parity and real reconnect behavior.
- **Reasoning**: Balances confidence and practicality; avoids regressions missed by purely manual or purely automated testing.

### 10) Web Asset Caching Policy

- **Chosen option**: Split policy.
- **Decision detail**:

  - `index.html` and runtime config: no-store (or short revalidate-first policy).
  - Fingerprinted JS/CSS/assets: long cache (`immutable`) policy.

- **Reasoning**: Ensures fast loads while guaranteeing users observe new web deployments without restarting services.

### 11) Rollback Procedure

- **Chosen option**: Atomic pointer rollback.
- **Decision detail**: Keep previous versioned artifacts and roll back by atomically switching active pointer to prior known-good build.
- **Reasoning**: Fastest recovery path with no rebuild and no desktop/core restart.

### 12) CORS/Cookie Environment Policy

- **Chosen option**: Explicit matrix.
- **Decision detail**: Define allowed origins, credential behavior, cookie flags, and SSE constraints per environment (localhost dev, LAN/dev cert, production).
- **Reasoning**: Prevents environment-specific auth/SSE breakage and clarifies secure defaults.

### 13) Shared Contract Model Strategy

- **Chosen option**: Generated TS + verified C#.
- **Decision detail**: Generate web client types from OpenAPI in TS; continue server/desktop C# contract verification against OpenAPI to detect drift.
- **Reasoning**: Reduces schema mismatch risk and supports parity across web/desktop/mobile evolution.

### 14) Feature-Flag Governance

- **Chosen option**: Time-bounded flags.
- **Decision detail**: Every migration flag has owner, purpose, default by environment, validation coverage, and explicit removal target.
- **Reasoning**: Enables controlled rollout while preventing permanent flag debt.

## High-Level M7 Implementation Plan (Aligned to Decisions)

### Phase A - Web Client Foundation and Hosting Separation

1. Stand up `ReelRoulette.WebUI` Vite+TS app structure in `src/clients/web/ReelRoulette.WebUI`.
2. Define runtime config contract (`apiBaseUrl`, `sseUrl`, optional capability metadata endpoint).
3. Add independent static hosting path and local dev workflow (no desktop-hosted dependency).

### Phase B - Contracts, Auth, and SSE Reliability

1. Integrate generated TS API/event models from OpenAPI and wire capability checks.
2. Implement pairing-token bootstrap and secure cookie session handling in decoupled web flow.
3. Implement SSE revision reconnect path with replay and authoritative requery fallback.

### Phase C - Deployment, Caching, and Rollback

1. Publish web builds as versioned immutable artifacts.
2. Activate build via atomic pointer switch; maintain quick rollback to prior version.
3. Apply split cache headers (shell/config fresh, hashed assets immutable).

### Phase D - Cutover and Legacy Removal

1. Introduce time-bounded migration feature flag(s) for independent web path.
2. Verify parity with core API/SSE (including `refreshStatusChanged`) while flag is on.
3. Promote to default path; remove legacy `WebRemoteServer` mutation/event bridge flows per M7 acceptance.

### Phase E - Verification and Sign-Off

1. Automated gates:

   - web build output validation
   - OpenAPI compatibility and generated model checks
   - direct web-to-core SSE status projection checks

2. Manual gates:

   - direct web connect without desktop bridge
   - refresh status line behavior during running/failure/completion
   - auth/pairing and reconnect continuity checks

3. Confirm milestone acceptance criteria in `MILESTONES.md` and finalize docs delta.
