import { useApp } from "./appContext";

export function StatusLine() {
  const { store } = useApp();
  return <div id="status" class="status status-bottom">{store.status.value}</div>;
}

/** The client and session ids, shown below the status line on mobile browsers. */
export function MobileDiagnostics() {
  const { store } = useApp();
  const { clientId, sessionId, clientType } = store.identity;
  if (clientType !== "mobile-web") {
    return <div id="mobile-diagnostics" class="status diagnostics-mobile" style={{ display: "none" }} />;
  }
  return (
    <div id="mobile-diagnostics" class="status diagnostics-mobile" style={{ display: "block" }}>
      {`Diagnostics: clientId=${clientId.slice(0, 10)}..., sessionId=${sessionId.slice(0, 10)}..., type=${clientType}`}
    </div>
  );
}
