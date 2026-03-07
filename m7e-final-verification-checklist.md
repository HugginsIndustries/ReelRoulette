# M7e Final Verification Checklist

Use this checklist to confirm M7e compatibility/sign-off criteria on your environment.

## 1) Automated gate commands

Run from repo root:

```powershell
dotnet build .\ReelRoulette.sln
dotnet test .\ReelRoulette.sln
```

Run from WebUI folder:

```powershell
cd .\src\clients\web\ReelRoulette.WebUI
npm run verify
```

Expected:
- All commands pass.
- `npm run verify` includes `verify:contracts` and reports generated OpenAPI contracts are up-to-date.

## 2) Manual verification (PASS/FAIL)

### A - Direct web connect
- `A1` WebUI loads from independent WebHost endpoint without desktop-hosted bridge.
- `A2` Version probe/auth bootstrap succeeds when server is compatible.
- `A3` If server compatibility is intentionally broken (test-only), WebUI shows clear compatibility/capability error and blocks unsupported usage.

### B - Refresh parity over direct web-to-core path
- `B1` Start a refresh run from desktop/API and observe WebUI status updates for running stage transitions.
- `B2` Confirm completion message projects in WebUI when run completes.
- `B3` Confirm failure projection message appears in WebUI when run fails (if you can trigger safely).

### C - Auth and reconnect continuity
- `C1` Pair flow succeeds when required.
- `C2` Reload/navigation keeps session continuity as expected.
- `C3` SSE reconnects after transient disconnect and resumes normal behavior.

## 3) Response template

Reply with:

- `Overall: PASS` or `FAIL`
- failed IDs + observed behavior
- if PASS: **“M7e manual gate approved.”**
