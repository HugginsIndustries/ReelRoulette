# Architecture

## Current State (M0 baseline)

```mermaid
flowchart TD
    desktopApp["Desktop App"]
    embeddedWebUi["Embedded Web Remote UI"]
    localJsonState["Local JSON State"]
    desktopApp --> embeddedWebUi
    desktopApp --> localJsonState
```

## Target State

```mermaid
flowchart TD
    windowsClient["Windows Client"]
    webClient["Web Client"]
    androidClient["Android Client"]
    serverApi["Server API"]
    coreDomain["Core Domain"]
    storageServices["Storage Services"]
    windowsClient --> serverApi
    webClient --> serverApi
    androidClient --> serverApi
    serverApi --> coreDomain
    coreDomain --> storageServices
```

## M0/M1 Boundary

- M0 introduces the target repo layout and project stubs without changing runtime behavior.
- M1 extracts pure domain logic into `ReelRoulette.Core` with desktop adapters calling into core.
- Desktop UI remains the shipping runtime while core extraction happens by feature slice.
